import { PlaybackStateReporter } from "@vestibule-link/alexa-video-skill-types";
import { CapabilityEmitter, StateEmitter } from "@vestibule-link/bridge-assistant-alexa";
import { MythAlexaEventFrontend } from "./Frontend";

type DirectiveType = PlaybackStateReporter.NamespaceType;
const DirectiveName: DirectiveType = PlaybackStateReporter.namespace;
export default class FrontendPlaybackState
    implements StateEmitter, CapabilityEmitter {
    constructor(readonly fe: MythAlexaEventFrontend) {
        fe.alexaEmitter.on('refreshState', this.refreshState.bind(this));
        fe.alexaEmitter.on('refreshCapability', this.refreshCapability.bind(this));
        fe.mythEventEmitter.on('LIVETV_STARTED', message => {
            this.updatePlayingState(this.fe.eventDeltaId())
        });
        fe.mythEventEmitter.on('PLAY_CHANGED', message => {
            this.updatePlayingState(this.fe.eventDeltaId())
        });
        fe.mythEventEmitter.on('PLAY_STARTED', message => {
            this.updatePlayingState(this.fe.eventDeltaId())
        });
        fe.mythEventEmitter.on('PLAY_UNPAUSED', message => {
            this.updatePlayingState(this.fe.eventDeltaId())
        });
        fe.mythEventEmitter.on('PLAY_PAUSED', message => {
            this.updatePausedState(this.fe.eventDeltaId())
        });
        fe.mythEventEmitter.on('LIVETV_ENDED', message => {
            this.updateStoppedState(this.fe.eventDeltaId())
        });
        fe.mythEventEmitter.on('PLAY_STOPPED', message => {
            this.updateStoppedState(this.fe.eventDeltaId())
        });
    }
    refreshState(deltaId: symbol): void {
        const promise = this.updatePlaybackState(deltaId);
        this.fe.alexaEmitter.watchDeltaUpdate(promise, deltaId);
    }

    private async updatePlaybackState(deltaId: symbol): Promise<void> {
        const state = await this.playbackState();
        this.updateState(state, deltaId);
    }
    refreshCapability(deltaId: symbol): void {
        this.fe.alexaEmitter.emit('capability', DirectiveName, ['playbackState'], deltaId);
    }
    private async playbackState(): Promise<PlaybackStateReporter.States> {
        if (await this.fe.isWatching()) {
            const status = await this.fe.GetStatus();
            const feState = status.State;
                if (feState.playspeed == '0') {
                return 'PAUSED';
            } else {
                return 'PLAYING';
            }
        } else {
            return 'STOPPED';
        }
    }

    private updateState(state: PlaybackStateReporter.States, deltaId: symbol): void {
        this.fe.alexaEmitter.emit('state', DirectiveName, 'playbackState', state, deltaId);
    }
    private updatePlayingState(deltaId: symbol) {
        this.updateState('PLAYING', deltaId);
    }
    private updatePausedState(deltaId: symbol) {
        this.updateState('PAUSED', deltaId);
    }
    private updateStoppedState(deltaId: symbol) {
        this.updateState('STOPPED', deltaId);
    }
}
