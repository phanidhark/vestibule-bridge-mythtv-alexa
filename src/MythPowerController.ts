import { PowerController } from "@vestibule-link/alexa-video-skill-types";
import { CapabilityEmitter, DirectiveHandlers, StateEmitter, SupportedDirectives } from "@vestibule-link/bridge-assistant-alexa";
import { EndpointState, SubType } from "@vestibule-link/iot-types";
import { MythAlexaEventFrontend } from "./Frontend";

type DirectiveType = PowerController.NamespaceType;
const DirectiveName: DirectiveType = PowerController.namespace;
type Response = {
    payload: {}
    state?: { [DirectiveName]?: SubType<EndpointState, DirectiveType> }
}

export default class FrontendPower
    implements SubType<DirectiveHandlers, DirectiveType>, StateEmitter, CapabilityEmitter {
    readonly supported: SupportedDirectives<DirectiveType> = [];
    constructor(readonly fe: MythAlexaEventFrontend) {
        fe.alexaEmitter.on('refreshState', this.refreshState.bind(this));
        fe.alexaEmitter.on('refreshCapability', this.refreshCapability.bind(this));
        fe.alexaEmitter.registerDirectiveHandler(DirectiveName, this);
        fe.mythEventEmitter.on('CLIENT_CONNECTED', message => {
            this.updateOnState(this.fe.eventDeltaId())
        });
        fe.mythEventEmitter.on('CLIENT_DISCONNECTED', message => {
            this.updateOffState(this.fe.eventDeltaId())
        });
    }
    refreshState(deltaId: symbol): void {
        const promise = this.updatePowerState(deltaId);
        this.fe.alexaEmitter.watchDeltaUpdate(promise, deltaId);
    }
    private async updatePowerState(deltaId: symbol): Promise<void> {
        const state = await this.powerState();
        this.updateState(state, deltaId);
    }
    refreshCapability(deltaId: symbol): void {
        this.fe.alexaEmitter.emit('capability', DirectiveName, ['powerState'], deltaId);
    }

    TurnOn(payload: {}): Promise<Response> {
        throw new Error("Method not implemented.");
    }
    TurnOff(payload: {}): Promise<Response> {
        throw new Error("Method not implemented.");
    }

    private updateOnState(deltaId: symbol) {
        this.updateState('ON', deltaId);
    }

    private updateOffState(deltaId: symbol) {
        this.updateState('OFF', deltaId);
    }

    private updateState(state: PowerController.States, deltaId: symbol): void {
        this.fe.alexaEmitter.emit('state', DirectiveName, 'powerState', state, deltaId);
    }

    async powerState(): Promise<PowerController.States> {
        try {
            const resp =await this.fe.SendAction({
                Action: 'FAKE'
            }, false);
            return 'ON';
        } catch (err) {
            console.error(err)
            return 'OFF';
        }
    }
}