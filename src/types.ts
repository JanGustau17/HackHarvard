export type Pose = { position:[number,number,number], quaternion:[number,number,number,number] };
export type NoteDoc = {
  text: string;
  color: string;
  pose: any;
  size: number;
  votes: number;
  shape?: "sticky" | "circle" | "diamond" | "hex" | "star";
};

export type EdgeDoc = { from:string; to:string; weight:number; createdAt?: any };
