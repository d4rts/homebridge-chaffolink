import axios, { AxiosInstance } from 'axios';
import { Logger } from 'homebridge';
import { BASE_API_URL } from './settings'
import {userInfo} from "node:os";

type ClientOptions = {
    email: string;
    password: string;
    pollInterval: number;
    failRetryTime: number;
};

export class ChaffoLinkClient {
    private http: AxiosInstance;
    private token: string | null = null;
    private gwId: string | null = null;

    constructor(private opts: ClientOptions, private log: Logger) {
        this.http = axios.create({
            baseURL: BASE_API_URL,
            timeout: 10000,
        });
    }

    async login(): Promise<void> {
        this.log.info('Connexion ChaffoLink…');
        // TODO: adapte à ton endpoint d'auth
        const res = await this.http.post('/api/v2/accounts/login', {
            "imp": false,
            "appInfo": {
                "os": 2,
                "appVer": "6.0.6.40257",
                "AppId": "com.remotethermo.chaffolink"
            },
            "noTrack": true,
            "usr": this.opts.email,
            "pwd": this.opts.password,
        });
        const token = res.data?.token;
        if (!token) throw new Error('Token manquant dans la réponse login');
        this.token = token;
        this.http.defaults.headers.common['ar.authToken'] = `${this.token}`;

        const res2 = await this.http.get('/api/v2/remote/plants/lite');
        const gwId = res2.data[0]?.gwId;
        this.gwId = gwId;

        this.log.info('Connexion ChaffoLink OK');
    }

    async getStatus(attempt: number = 0): Promise<{ roomTemp: number; desiredTemp: number; heatingEnabled: boolean; }> {
        let res = null;
        try {
            res = await this.http.post('/api/v2/remote/dataItems/' + this.gwId + '/get?umsys=si', {
                "useCache": true,
                "items": [
                    {
                        "id": "OutsideTemp",
                        "zn": 0
                    },
                    {
                        "id": "PlantMode",
                        "zn": 0
                    },
                    {
                        "id": "Holiday",
                        "zn": 0
                    },
                    {
                        "id": "AutomaticThermoregulation",
                        "zn": 0
                    },
                    {
                        "id": "IsFlameOn",
                        "zn": 0
                    },
                    {
                        "id": "ZoneHeatRequest",
                        "zn": 1
                    },
                    {
                        "id": "ZoneMode",
                        "zn": 1
                    },
                    {
                        "id": "ZoneDesiredTemp",
                        "zn": 1
                    },
                    {
                        "id": "ZoneMeasuredTemp",
                        "zn": 1
                    },
                    {
                        "id": "ZoneDeroga",
                        "zn": 1
                    },
                    {
                        "id": "ZoneComfortTemp",
                        "zn": 1
                    },
                    {
                        "id": "IsZonePilotOn",
                        "zn": 1
                    },
                    {
                        "id": "HeatingFlowTemp",
                        "zn": 1
                    },
                    {
                        "id": "CoolingFlowTemp",
                        "zn": 1
                    },
                    {
                        "id": "HeatingFlowOffset",
                        "zn": 1
                    },
                    {
                        "id": "CoolingFlowOffset",
                        "zn": 1
                    },
                    {
                        "id": "ZeroColdWaterSettings",
                        "zn": 0
                    }
                ],
                "features": {
                    "zones": [
                        {
                            "num": 1,
                            "name": "",
                            "roomSens": false,
                            "geofenceDeroga": true,
                            "virtInfo": null,
                            "isHidden": false
                        }
                    ],
                    "solar": false,
                    "convBoiler": false,
                    "commBoiler": false,
                    "hpSys": false,
                    "hybridSys": false,
                    "cascadeSys": false,
                    "dhwProgSupported": false,
                    "virtualZones": false,
                    "hasVmc": false,
                    "extendedTimeProg": false,
                    "hasBoiler": true,
                    "pilotSupported": true,
                    "isVmcR2": false,
                    "isEvo2": false,
                    "dhwHidden": false,
                    "dhwBoilerPresent": false,
                    "dhwModeChangeable": true,
                    "hvInputOff": false,
                    "autoThermoReg": true,
                    "hasMetering": true,
                    "hasFireplace": false,
                    "hasSlp": false,
                    "hasEm20": false,
                    "hasEm30": false,
                    "systemServices": 0,
                    "hasTwoCoolingTemp": false,
                    "bmsActive": false,
                    "hpCascadeSys": false,
                    "hpCascadeConfig": -1,
                    "bufferTimeProgAvailable": false,
                    "distinctHeatCoolSetpoints": false,
                    "hasZoneNames": false,
                    "zoneManagerStandAlone": false,
                    "hydraulicScheme": null,
                    "preHeatingSupported": false,
                    "hasGahp": false,
                    "zigbeeActive": false,
                    "hasSlpAloneOnBus": false,
                    "isSlpCascade": false,
                    "hasZeroColdWaterProg": false,
                    "weatherProvider": 0,
                    "hasDhwTimeProgTemperatures": 2,
                    "isGSWHCommercialAloneOnBus": false
                },
                "culture": "en"
            });
        } catch (e) {
            await this.login();
            if (attempt > 3) {
                throw e;
            }
            return await this.getStatus(attempt + 1);
        }
        let roomTemp = 0;
        let desiredTemp = 0;
        let heatingEnabled: boolean = false;
        res.data?.items.forEach((item: any) => {
            if (item.id === "ZoneMeasuredTemp") {
                roomTemp = item.value;
            } else if (item.id === "ZoneDesiredTemp") {
                desiredTemp = item.value;
            } else if (item.id === "PlantMode") {
                if (parseInt(item.value) === 1) {
                    heatingEnabled = true;
                }
            }
        });

        return { roomTemp, desiredTemp, heatingEnabled };
    }

    async setTargetTemp(value: number, attempt: number = 0): Promise<void> {
        try {
            await this.http.post('/api/v2/remote/zones/' + this.gwId + '/1/temperatures?umsys=si', {
                "new": {
                    "econ": 16,
                    "comf": value
                },
                "old": {
                    "econ": 0,
                    "comf": 0
                }
            });
        } catch (e) {
            if (attempt > 3) {
                throw e;
            }
            await this.login();
            return await this.setTargetTemp(value, attempt + 1);
        }
    }

    async setHeatingActive(active: boolean, attempt: number = 0): Promise<void> {
        try {
            await this.http.post('/api/v2/remote/plantData/' + this.gwId + '/mode', {
                "old": (active ? 0 : 1),
                "new": (active ? 1 : 0)
            });
        } catch (e) {
            if (attempt > 3) {
                throw e;
            }
            await this.login();
            return await this.setHeatingActive(active, attempt + 1);
        }
    }
}
