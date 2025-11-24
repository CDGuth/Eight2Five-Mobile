import { DEFAULT_TX_POWER_DBM } from "../config";
import {
  AnchorGeometry,
  LocalizationOptimizer,
  OptimizationInput,
  PositionEstimate,
  SearchBounds,
} from "../types";

const DEFAULT_OPTIONS = {
  populationSize: 25,
  maxIterations: 200,
  beta0: 1,
  lightAbsorption: 0.5,
  alpha: 0.2,
  randomStepScale: 1,
  initialTemperature: 10,
  coolingRate: 0.95,
  timeBudgetMs: 8,
};

interface Firefly {
  position: { x: number; y: number };
  error: number;
  intensity: number;
}

export interface MFASAOptions {
  populationSize: number;
  maxIterations: number;
  beta0: number;
  lightAbsorption: number;
  alpha: number;
  randomStepScale: number;
  initialTemperature: number;
  coolingRate: number;
  timeBudgetMs: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function now(): number {
  if (typeof performance !== "undefined" && performance.now) {
    return performance.now();
  }
  return Date.now();
}

export class MFASAOptimizer implements LocalizationOptimizer {
  private readonly options: MFASAOptions;

  constructor(options: Partial<MFASAOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options } as MFASAOptions;
  }

  solve(opts: OptimizationInput): Promise<PositionEstimate> {
    const config: MFASAOptions = {
      ...this.options,
      timeBudgetMs: opts.timeBudgetMs ?? this.options.timeBudgetMs,
    };

    return new Promise((resolve) => {
      const population = this.initializePopulation(config.populationSize, opts);
      let best = this.extractBest(population, 0);
      let temperature = config.initialTemperature;
      let iteration = 0;

      const step = () => {
        const stepStart = now();
        while (iteration < config.maxIterations) {
          this.performFireflyMoves(population, config, opts);
          this.performSimulatedAnnealing(population, temperature, config, opts);

          iteration += 1;
          temperature *= config.coolingRate;
          best = this.extractBest(population, iteration, best);

          if (now() - stepStart >= config.timeBudgetMs) {
            setTimeout(step, 0);
            return;
          }
        }

        resolve(best);
      };

      step();
    });
  }

  private initializePopulation(
    size: number,
    opts: OptimizationInput,
  ): Firefly[] {
    const fireflies: Firefly[] = [];
    for (let i = 0; i < size; i += 1) {
      const position = this.randomPoint(opts.bounds);
      const error = this.evaluate(position, opts);
      fireflies.push({ position, error, intensity: -error });
    }
    return fireflies;
  }

  private extractBest(
    population: Firefly[],
    iterations: number,
    previous?: PositionEstimate,
  ): PositionEstimate {
    const bestFirefly = population.reduce((a, b) =>
      a.error <= b.error ? a : b,
    );
    if (previous && previous.errorRmse <= bestFirefly.error) {
      return previous;
    }
    return {
      x: bestFirefly.position.x,
      y: bestFirefly.position.y,
      errorRmse: bestFirefly.error,
      iterations,
    };
  }

  private performFireflyMoves(
    population: Firefly[],
    config: MFASAOptions,
    opts: OptimizationInput,
  ) {
    for (let i = 0; i < population.length; i += 1) {
      for (let j = 0; j < population.length; j += 1) {
        if (population[j].intensity > population[i].intensity) {
          population[i] = this.moveTowards(
            population[i],
            population[j],
            config,
            opts,
          );
        }
      }
    }
  }

  private moveTowards(
    target: Firefly,
    attractor: Firefly,
    config: MFASAOptions,
    opts: OptimizationInput,
  ): Firefly {
    const dx = attractor.position.x - target.position.x;
    const dy = attractor.position.y - target.position.y;
    const distance = Math.hypot(dx, dy);
    const beta =
      config.beta0 * Math.exp(-config.lightAbsorption * distance ** 2);

    const jitterX = (Math.random() - 0.5) * config.alpha;
    const jitterY = (Math.random() - 0.5) * config.alpha;

    const newX = clamp(
      target.position.x + beta * dx + jitterX,
      opts.bounds.xMin,
      opts.bounds.xMax,
    );
    const newY = clamp(
      target.position.y + beta * dy + jitterY,
      opts.bounds.yMin,
      opts.bounds.yMax,
    );

    const position = { x: newX, y: newY };
    const error = this.evaluate(position, opts);
    return { position, error, intensity: -error };
  }

  private performSimulatedAnnealing(
    population: Firefly[],
    temperature: number,
    config: MFASAOptions,
    opts: OptimizationInput,
  ) {
    for (let i = 0; i < population.length; i += 1) {
      const candidatePosition = {
        x: clamp(
          population[i].position.x +
            (Math.random() - 0.5) * config.randomStepScale,
          opts.bounds.xMin,
          opts.bounds.xMax,
        ),
        y: clamp(
          population[i].position.y +
            (Math.random() - 0.5) * config.randomStepScale,
          opts.bounds.yMin,
          opts.bounds.yMax,
        ),
      };

      const candidateError = this.evaluate(candidatePosition, opts);
      const delta = candidateError - population[i].error;

      if (delta < 0) {
        population[i] = {
          position: candidatePosition,
          error: candidateError,
          intensity: -candidateError,
        };
      } else {
        const acceptanceProbability = Math.exp(
          -delta / Math.max(temperature, 1e-6),
        );
        if (Math.random() < acceptanceProbability) {
          population[i] = {
            position: candidatePosition,
            error: candidateError,
            intensity: -candidateError,
          };
        }
      }
    }
  }

  private randomPoint(bounds: SearchBounds) {
    return {
      x: bounds.xMin + Math.random() * (bounds.xMax - bounds.xMin),
      y: bounds.yMin + Math.random() * (bounds.yMax - bounds.yMin),
    };
  }

  private evaluate(
    position: { x: number; y: number },
    opts: OptimizationInput,
  ): number {
    const { candidate, anchors, propagation, constants } = opts;
    if (!candidate.length || !anchors.length) {
      return Number.POSITIVE_INFINITY;
    }

    const anchorMap = this.buildAnchorMap(anchors);
    let sumSq = 0;
    let used = 0;

    candidate.forEach((measurement) => {
      const anchor = anchorMap.get(measurement.mac);
      if (!anchor) return;

      const horizontalDistance = Math.hypot(
        position.x - anchor.x,
        position.y - anchor.y,
      );

      const txPower = measurement.txPower ?? DEFAULT_TX_POWER_DBM;
      const estimated = propagation.estimateRssi({
        distanceMeters: horizontalDistance,
        txPowerDbm: txPower,
        constants,
      });
      const diff = measurement.filteredRssi - estimated;
      sumSq += diff ** 2;
      used += 1;
    });

    if (!used) {
      return Number.POSITIVE_INFINITY;
    }

    return Math.sqrt(sumSq / used);
  }

  private buildAnchorMap(anchors: AnchorGeometry[]) {
    const map = new Map<string, AnchorGeometry>();
    anchors.forEach((anchor) => {
      map.set(anchor.mac, anchor);
    });
    return map;
  }
}
