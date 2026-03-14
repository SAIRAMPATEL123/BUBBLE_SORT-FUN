export type Color = string;

export interface Bubble {
  color: Color;
  id: string;
  bombTimer?: number; // moves remaining
}

export type ObstacleType = 'mystery' | 'locked' | 'one-way-in' | 'one-way-out' | 'portal';

export interface TubeObstacle {
  type: ObstacleType;
  value?: number; // e.g., moves remaining for 'locked'
  portalId?: number; // ID of the connected portal
}

export type PowerUpType = 'magnet' | 'shield' | 'speed' | 'gravity';

export interface ActiveEffects {
  shield: boolean;
  speed: number; // multiplier, e.g., 2
  speedUntil: number; // timestamp
  isGravityFlipped: boolean;
}

export interface GameState {
  tubes: Bubble[][];
  selectedTubeIndex: number | null;
  moves: number;
  score: number;
  highScore: number;
  isWon: boolean;
  history: { tubes: Bubble[][], score: number }[];
  level: number;
  completedSets: number;
  obstacles: (TubeObstacle | null)[];
  powerUps: {
    [key in PowerUpType]: number; // count
  };
  activeEffects: ActiveEffects;
  isDailyChallenge: boolean;
  lastBombExploded?: boolean;
}

export const COLORS: Color[] = [
  '#FF5F5F', // Red
  '#5FFF5F', // Green
  '#5F5FFF', // Blue
  '#FFFF5F', // Yellow
  '#FF5FFF', // Magenta
  '#5FFFFF', // Cyan
  '#FFA500', // Orange
  '#800080', // Purple
];

export const TUBE_CAPACITY = 4;
export const INITIAL_TUBES_COUNT = 5;
export const EMPTY_TUBES_COUNT = 2;
