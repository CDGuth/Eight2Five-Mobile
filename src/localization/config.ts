import { PropagationConstants } from "./types";

/**
 * Centralized defaults for propagation constants. Values come from the paper's
 * simulation setup unless overridden by user input.
 */
export const DEFAULT_PROPAGATION_CONSTANTS: PropagationConstants = {
  transmitterHeightMeters: 4,
  receiverHeightMeters: 1.5,
  frequencyHz: 2.4e9,
  transmitterGain: 1,
  receiverGain: 1,
  reflectionCoefficient: 1,
};

export const DEFAULT_FIELD_DIMENSIONS = {
  widthMeters: 100,
  lengthMeters: 100,
};

export const DEFAULT_TX_POWER_DBM = 8;
