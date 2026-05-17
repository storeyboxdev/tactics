/**
 * The maps shipped with the game, collected into one array. Custom maps
 * authored in the editor live in the localStorage store (`CustomMaps`);
 * code that needs the full pool unions the two.
 */

import { MapData } from '../battle/Map';
import grasslandJson from './maps/grassland.json';
import stoneCorridorJson from './maps/stone_corridor.json';
import waterPondJson from './maps/water_pond.json';
import highGroundJson from './maps/high_ground.json';
import bridgeJson from './maps/bridge.json';
import dunesJson from './maps/dunes.json';
import ruinsJson from './maps/ruins.json';

export const BUILT_IN_MAPS = [
  grasslandJson, stoneCorridorJson, waterPondJson, highGroundJson,
  bridgeJson, dunesJson, ruinsJson,
] as unknown as MapData[];
