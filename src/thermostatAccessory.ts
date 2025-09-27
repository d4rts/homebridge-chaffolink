import {
    CharacteristicValue,
    PlatformAccessory,
    Service,
} from 'homebridge';
import { ChaffoLinkPlatform } from './platform';

type ThermoState = {
    currentTemp: number;
    targetTemp: number;
    heatingActive: boolean; // true = Heat, false = Off
};

export class ThermostatAccessory {
    private service: Service;
    private state: ThermoState = {
        currentTemp: 21.0,
        targetTemp: 22.0,
        heatingActive: true,
    };

    private readonly Characteristic = this.platform.api.hap.Characteristic;

    private readonly minTemp: number;
    private readonly maxTemp: number;
    private readonly pollIntervalMs: number;
    private readonly failRetryTime: number;

    constructor(
        private readonly platform: ChaffoLinkPlatform,
        private readonly accessory: PlatformAccessory,
    ) {
        const { Service } = this.platform.api.hap;

        this.minTemp = Number((this.platform as any).config?.minTemp ?? 5);
        this.maxTemp = Number((this.platform as any).config?.maxTemp ?? 35);
        this.pollIntervalMs = Number((this.platform as any).config?.pollInterval ?? 10000);
        this.failRetryTime = Number((this.platform as any).config?.failRetryTime ?? 60000);

        this.accessory.getService(Service.AccessoryInformation)!
            .setCharacteristic(this.Characteristic.Manufacturer, 'Chaffoteaux')
            .setCharacteristic(this.Characteristic.Model, 'ChaffoLink')
            .setCharacteristic(this.Characteristic.SerialNumber, 'CL-0001');

        this.service =
            this.accessory.getService(Service.Thermostat) ||
            this.accessory.addService(Service.Thermostat, this.accessory.displayName);

        this.service.getCharacteristic(this.Characteristic.TargetTemperature)
            .setProps({
                minValue: this.minTemp,
                maxValue: this.maxTemp,
                minStep: 0.5,
            });


        this.service.getCharacteristic(this.Characteristic.CurrentTemperature)
            .onGet(this.handleGetCurrentTemperature.bind(this));


        this.service.getCharacteristic(this.Characteristic.TargetTemperature)
            .onGet(this.handleGetTargetTemperature.bind(this))
            .onSet(this.handleSetTargetTemperature.bind(this));


        this.service.getCharacteristic(this.Characteristic.CurrentHeatingCoolingState)
            .onGet(this.handleGetCurrentHeatingCoolingState.bind(this));


        this.service.getCharacteristic(this.Characteristic.TargetHeatingCoolingState)
            .setProps({
                validValues: [
                    this.Characteristic.TargetHeatingCoolingState.OFF,
                    this.Characteristic.TargetHeatingCoolingState.HEAT,
                ],
            })
            .onGet(this.handleGetTargetHeatingCoolingState.bind(this))
            .onSet(this.handleSetTargetHeatingCoolingState.bind(this));


        this.service.setCharacteristic(this.Characteristic.TemperatureDisplayUnits,
            this.Characteristic.TemperatureDisplayUnits.CELSIUS);

        this.startPolling();
    }

    // ======= Handlers =======

    private async handleGetCurrentTemperature(): Promise<number> {
        this.platform.log.debug('Get CurrentTemperature');
        // Valeur en cache (rafraîchie par polling)
        return this.state.currentTemp;
    }

    private async handleGetTargetTemperature(): Promise<number> {
        this.platform.log.debug('Get TargetTemperature');
        return this.state.targetTemp;
    }

    private async handleSetTargetTemperature(value: CharacteristicValue) {
        const t = Number(value);
        this.platform.log.info(`Set TargetTemperature → ${t}°C`);
        try {
            await this.platform.client.setTargetTemp(t);
            this.state.targetTemp = t;
        } catch (e) {
            this.platform.log.error('Error setTargetTemperature:', e);
            this.service.updateCharacteristic(this.Characteristic.TargetTemperature, this.state.targetTemp);
            throw e;
        }
    }

    private async handleGetCurrentHeatingCoolingState(): Promise<number> {
        const active = this.state.heatingActive && (this.state.currentTemp < this.state.targetTemp - 0.1);
        return active
            ? this.Characteristic.CurrentHeatingCoolingState.HEAT
            : this.Characteristic.CurrentHeatingCoolingState.OFF;
    }

    private async handleGetTargetHeatingCoolingState(): Promise<number> {
        return this.state.heatingActive
            ? this.Characteristic.TargetHeatingCoolingState.HEAT
            : this.Characteristic.TargetHeatingCoolingState.OFF;
    }

    private async handleSetTargetHeatingCoolingState(value: CharacteristicValue) {
        const v = Number(value);
        const enableHeat = v === this.Characteristic.TargetHeatingCoolingState.HEAT;
        this.platform.log.info(`Set TargetHeatingCoolingState → ${enableHeat ? 'HEAT' : 'OFF'}`);
        try {
            await this.platform.client.setHeatingActive(enableHeat);
            this.state.heatingActive = enableHeat;
        } catch (e) {
            this.platform.log.error('Error setHeatingActive:', e);

            this.service.updateCharacteristic(
                this.Characteristic.TargetHeatingCoolingState,
                this.state.heatingActive
                    ? this.Characteristic.TargetHeatingCoolingState.HEAT
                    : this.Characteristic.TargetHeatingCoolingState.OFF,
            );
            throw e;
        }
    }

    // ======= Polling =======
    private startPolling() {
        const tick = async () => {
            try {
                const s = await this.platform.client.getStatus();
                this.state.currentTemp = s.roomTemp;
                this.state.targetTemp = s.desiredTemp;
                this.state.heatingActive = s.heatingEnabled;

                this.service.updateCharacteristic(this.Characteristic.CurrentTemperature, this.state.currentTemp);
                this.service.updateCharacteristic(this.Characteristic.TargetTemperature, this.state.targetTemp);
                this.service.updateCharacteristic(
                    this.Characteristic.CurrentHeatingCoolingState,
                    await this.handleGetCurrentHeatingCoolingState(),
                );
                setTimeout(tick, this.pollIntervalMs);
            } catch (e) {
                this.platform.log.warn('Polling error:', e as Error);
                setTimeout(tick, this.failRetryTime);
            }
        };
        setTimeout(tick, 1000);
    }
}
