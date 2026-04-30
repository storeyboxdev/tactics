export type Team = 'player' | 'enemy';

// Cardinal facing in world coordinates.
//   N = -Z (0), E = +X (1), S = +Z (2), W = -X (3)
export type Facing = 0 | 1 | 2 | 3;

export const FACING_N: Facing = 0;
export const FACING_E: Facing = 1;
export const FACING_S: Facing = 2;
export const FACING_W: Facing = 3;

export interface UnitStats {
  hp: number;
  mp: number;
  pa: number;     // physical attack
  ma: number;     // magic attack
  speed: number;  // CT tick rate
  move: number;   // tile move range
  jump: number;   // vertical climb
  faith: number;  // 0..100
  bravery: number;// 0..100
}

export interface UnitDef {
  id: string;
  name: string;
  team: Team;
  jobId: string;
  level: number;
  stats: UnitStats;
}

export class Unit {
  readonly id: string;
  name: string;
  team: Team;
  jobId: string;
  level: number;

  x: number;
  z: number;
  facing: Facing;

  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
  pa: number;
  ma: number;
  speed: number;
  move: number;
  jump: number;
  faith: number;
  bravery: number;

  ct = 0;

  constructor(def: UnitDef, x: number, z: number, facing: Facing) {
    this.id = def.id;
    this.name = def.name;
    this.team = def.team;
    this.jobId = def.jobId;
    this.level = def.level;
    this.x = x;
    this.z = z;
    this.facing = facing;

    this.hp = this.hpMax = def.stats.hp;
    this.mp = this.mpMax = def.stats.mp;
    this.pa = def.stats.pa;
    this.ma = def.stats.ma;
    this.speed = def.stats.speed;
    this.move = def.stats.move;
    this.jump = def.stats.jump;
    this.faith = def.stats.faith;
    this.bravery = def.stats.bravery;
  }

  get isAlive(): boolean { return this.hp > 0; }
}
