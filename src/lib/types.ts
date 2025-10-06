export type Pose = { position:[number,number,number], quaternion:[number,number,number,number] };
export type NoteDoc = {
  text: string;
  color: string;
  pose: Pose;   // host board space (MVP: local space)
  size: number; // meters
  votes: number;
  createdAt?: any; updatedAt?: any;
};
export type EdgeDoc = { from:string; to:string; weight:number; createdAt?: any };
