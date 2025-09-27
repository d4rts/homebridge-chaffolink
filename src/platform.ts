import {
    API,
    DynamicPlatformPlugin,
    Logger,
    PlatformAccessory,
    PlatformConfig,
} from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { ThermostatAccessory } from './thermostatAccessory';
import { ChaffoLinkClient } from './api';

export class ChaffoLinkPlatform implements DynamicPlatformPlugin {
    public readonly accessories: PlatformAccessory[] = [];
    public readonly client!: ChaffoLinkClient;

    constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API,
    ) {
        if (!config) {
            this.log.warn('No configuration found for this plugin.');
            return;
        }

        const email = String(config.email ?? '');
        const password = String(config.password ?? '');
        const pollInterval = Number(config.pollInterval ?? 10000);
        const failRetryTime = Number(config.failRetryTime ?? 60000);

        if (!email || !password) {
            this.log.error('Missing parameters: username/password mandatory.');
            return;
        }

        this.client = new ChaffoLinkClient({ email, password, pollInterval, failRetryTime }, this.log);

        this.api.on('didFinishLaunching', async () => {
            try {
                await this.client.login();
            } catch (e) {
                this.log.error('Login failed', e);
            }
            this.discoverDevices();
        });
    }

    configureAccessory(accessory: PlatformAccessory) {
        this.log.info('Accesory loaded from cache:', accessory.displayName);
        this.accessories.push(accessory);
    }

    private discoverDevices() {
        const deviceId = 'chaffolink-thermostat-1';
        const uuid = this.api.hap.uuid.generate(deviceId);
        const existing = this.accessories.find(a => a.UUID === uuid);

        if (existing) {
            this.log.info('Update existing accessory:', existing.displayName);
            new ThermostatAccessory(this, existing);
        } else {
            this.log.info('Save new device');
            const accessory = new this.api.platformAccessory('ChaffoLink Thermostat', uuid);
            new ThermostatAccessory(this, accessory);
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
    }
}
