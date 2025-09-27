import { API } from 'homebridge';
import { ChaffoLinkPlatform } from './platform';
import { PLUGIN_NAME, PLATFORM_NAME } from './settings';

export = (api: API) => {
    api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, ChaffoLinkPlatform);
};
