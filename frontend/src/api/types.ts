/** Short names for the generated API types. Never edit schema.d.ts by hand: npm run gen:api. */
import type { components } from './schema';

type Schemas = components['schemas'];

export type Status = Schemas['Status'];
export type Entity = Schemas['Entity'];
export type Actor = Schemas['Actor'];
export type Tree = Schemas['TreeOut'];
export type ProjectNode = Schemas['ProjectNodeOut'];
export type MilestoneNode = Schemas['MilestoneNodeOut'];
export type TaskNode = Schemas['TaskNodeOut'];
export type ProjectOut = Schemas['ProjectOut'];
export type MilestoneOut = Schemas['MilestoneOut'];
export type TaskOut = Schemas['TaskOut'];
export type Signals = Schemas['SignalsOut'];
export type Actual = Schemas['ActualOut'];
export type Focus = Schemas['FocusOut'];
export type OrbitEvent = Schemas['EventOut'];
export type WorkSession = Schemas['SessionOut'];
export type Meta = Schemas['MetaOut'];
export type ProjectPatch = Schemas['ProjectPatch'];
export type MilestonePatch = Schemas['MilestonePatch'];
export type TaskPatch = Schemas['TaskPatch'];
export type ProjectCreate = Schemas['ProjectCreate'];
