import { MythAlexaEventFrontend, MANUFACTURER_NAME } from "../src/Frontend";
import nock = require("nock");
import { frontend, Frontend, FrontendStatus, Bool } from "mythtv-services-api";
import { MythSenderEventEmitter } from "mythtv-event-emitter";
import { EventEmitter } from "events";
import { AlexaEndpointEmitter } from "@vestibule-link/bridge-assistant-alexa";
import { providersEmitter, responseRouter } from "@vestibule-link/bridge-assistant";
import { mergeObject } from "@vestibule-link/bridge-mythtv";
import { registerAssistant } from "@vestibule-link/bridge-assistant-alexa/dist/endpoint";
import { SinonSandbox, assert, match } from "sinon";
import { EndpointCapability, SubType, EndpointState, ResponseMessage } from "@vestibule-link/iot-types";
import { expect } from 'chai'
import { MemoizedFunction, memoize } from "lodash";
import { Directive } from "@vestibule-link/alexa-video-skill-types";
import { EventMapping } from "mythtv-event-emitter/dist/messages";

export interface MockMythAlexaEventFrontend extends MythAlexaEventFrontend {
    resetDeltaId(): void
}
class MockAlexaFrontend {
    readonly mythEventEmitter: MythSenderEventEmitter = new EventEmitter();
    private readonly memoizeEventDelta: MemoizedFunction
    eventDeltaId: () => symbol
    constructor(readonly alexaEmitter: AlexaEndpointEmitter, readonly fe: Frontend) {
        const memoizeEventDelta = memoize(() => {
            return Symbol();
        })
        this.eventDeltaId = memoizeEventDelta;
        this.memoizeEventDelta = memoizeEventDelta
    }
    async isWatchingTv(): Promise<boolean> {
        const status: FrontendStatus = await this.fe.GetStatus();
        const state = status.State.state;
        return state == 'WatchingLiveTV';
    }
    async isWatching(): Promise<boolean> {
        const status: FrontendStatus = await this.fe.GetStatus();
        const state = status.State.state;
        return state.startsWith('Watching');
    }
    async GetRefreshedStatus(): Promise<FrontendStatus> {
        return this.fe.GetStatus();
    }

    private clearCache(funct: MemoizedFunction) {
        funct.cache.clear && funct.cache.clear();
    }
    resetDeltaId() {
        this.clearCache(this.memoizeEventDelta);
    }
}

export function createFrontendNock(hostname: string) {
    return nock('http://' + hostname + ':6547/Frontend')
}

export function createBackendNock(service: string) {
    return nock("http://localhost:6544/" + service)
}
export async function createMockFrontend(hostname: string): Promise<MockMythAlexaEventFrontend> {
    const mythNock = createBackendNock('Myth')
        .get('/GetSetting').query({
            Key: 'FrontendStatusPort',
            HostName: hostname,
            Default: '6547'
        }).reply(200, () => {
            return {
                String: '6547'
            };
        }).get('/GetSetting').query({
            Key: 'Theme',
            HostName: hostname
        }).reply(200, () => {
            return {
                String: 'theme'
            };
        });
    registerAssistant();
    const fe = await frontend(hostname);
    const alexaEmitter = <AlexaEndpointEmitter>providersEmitter.getEndpointEmitter('alexa', { provider: MANUFACTURER_NAME, host: fe.hostname() }, true)
    const alexaFe = new MockAlexaFrontend(alexaEmitter, fe);
    const mergedFe: MockMythAlexaEventFrontend = mergeObject(alexaFe, fe);
    return mergedFe;
}

export async function verifyRefreshCapability<NS extends keyof EndpointCapability>(sandbox: SinonSandbox, frontend: MythAlexaEventFrontend, isAsync: boolean, expectedNamespace: NS, expectedCapability: SubType<EndpointCapability, NS>) {
    const emitterPromise = new Promise((resolve, reject) => {
        frontend.alexaEmitter.once('capability', (namespace, value, deltaId) => {
            try {
                expect(namespace).to.equal(expectedNamespace)
                expect(deltaId).to.equal(frontend.eventDeltaId())
                expect(value).eql(expectedCapability)
                resolve()
            } catch (err) {
                reject(err)
            }
        })
    })

    const watchDeltaUpdateSpy = sandbox.spy(frontend.alexaEmitter, 'watchDeltaUpdate')
    frontend.alexaEmitter.emit('refreshCapability', frontend.eventDeltaId());
    if (isAsync) {
        assert.calledOnce(watchDeltaUpdateSpy)
        assert.calledWith(watchDeltaUpdateSpy, match.any, frontend.eventDeltaId())
    }
    await emitterPromise;
}

export async function verifyState<NS extends keyof EndpointState, N extends keyof EndpointState[NS]>(sandbox: SinonSandbox,
    frontend: MythAlexaEventFrontend, expectedNamespace: NS, expectedName: N, expectedState: SubType<SubType<EndpointState, NS>, N>,
    triggerFunction: Function) {
    const emitterPromise = new Promise((resolve, reject) => {
        frontend.alexaEmitter.once('state', (namespace, name, value, deltaId) => {
            try {
                expect(namespace).to.equal(expectedNamespace)
                expect(name).to.equal(expectedName)
                expect(deltaId).to.equal(frontend.eventDeltaId())
                expect(value).eql(expectedState)
                resolve()
            } catch (err) {
                reject(err)
            }
        })
    })
    triggerFunction()
    await emitterPromise;
}

export async function verifyRefreshState<NS extends keyof EndpointState, N extends keyof EndpointState[NS]>(sandbox: SinonSandbox,
    frontend: MythAlexaEventFrontend, expectedNamespace: NS, expectedName: N, expectedState: SubType<SubType<EndpointState, NS>, N>) {
    await verifyState(sandbox, frontend, expectedNamespace, expectedName, expectedState, () => {
        frontend.alexaEmitter.emit('refreshState', frontend.eventDeltaId())
    })
}

export async function verifyMythEventState<NS extends keyof EndpointState, N extends keyof EndpointState[NS],T extends keyof EventMapping, P extends EventMapping[T]>(
    sandbox: SinonSandbox, frontend: MythAlexaEventFrontend, eventType: T, eventMessage: P,
    expectedNamespace: NS, expectedName: N, expectedState: SubType<SubType<EndpointState, NS>, N>) {
    await verifyState(sandbox, frontend, expectedNamespace, expectedName, expectedState, () => {
        frontend.mythEventEmitter.emit(eventType, eventMessage)
    })
}
export function toBool(data: boolean): Bool {
    return {
        bool: data + ''
    }
}

export async function verifyActionDirective<NS extends Directive.Namespaces, N extends keyof Directive.NamedMessage[NS]>(
    sandbox: SinonSandbox, frontend: MythAlexaEventFrontend, namespace: NS, name: N, requestMessage: any,
    expectedMythtvActions: ActionMessage[],
    expectedResponse: ResponseMessage<any>) {
    const messageId = Symbol();
    let frontendNock = createFrontendNock(frontend.hostname())
    expectedMythtvActions.forEach(mythAction => {
        frontendNock = frontendNock.post('/SendAction')
            .query({
                Action: mythAction.actionName
            }).reply(200, () => {
                return toBool(mythAction.response);
            })
    })
    const responsePromise = new Promise((resolve, reject) => {
        responseRouter.once(messageId, (response) => {
            try {
                expect(response).to.eql(expectedResponse)
                expect(frontendNock.isDone()).to.be.true
                resolve()
            } catch (err) {
                reject(err)
            }
        })
    })
    frontend.alexaEmitter.emit('directive', [namespace, <string>name], requestMessage, messageId)
    await responsePromise;
}

interface ActionMessage {
    actionName: string
    response: boolean
}