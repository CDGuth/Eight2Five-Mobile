import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  PanResponder,
  LayoutChangeEvent,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MFASAOptimizer } from "../localization/algorithms/MFASA";
import { LogNormalModel } from "../localization/models/LogNormalModel";
import { TwoRayGroundModel } from "../localization/models/TwoRayGroundModel";
import { KalmanFilter } from "../localization/filters/KalmanFilter";
import {
  DEFAULT_PROPAGATION_CONSTANTS,
  DEFAULT_FIELD_DIMENSIONS,
  DEFAULT_MFASA_OPTIONS,
  DEFAULT_TX_POWER_DBM,
} from "../localization/LocalizationConfig";
import {
  AnchorGeometry,
  BeaconMeasurement,
  PropagationConstants,
  SearchBounds,
} from "../localization/types";

const ACCENT_COLOR = "#3C6EC8";

const InputRow = ({
  label,
  value,
  onChange,
  tooltip,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  tooltip?: string;
}) => (
  <View style={styles.inputRow}>
    <View style={{ flex: 2, flexDirection: "row", alignItems: "center" }}>
      <Text style={{ fontSize: 14, color: "#333" }}>{label}</Text>
      {tooltip && (
        <TouchableOpacity
          onPress={() => Alert.alert(label, tooltip)}
          style={{ marginLeft: 8 }}
        >
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: "#ddd",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "bold", color: "#555" }}>
              ?
            </Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChange}
      keyboardType="numeric"
      placeholderTextColor="#999"
    />
  </View>
);

const Dropdown = ({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onSelect: (v: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View style={[styles.inputRow, { zIndex: isOpen ? 1000 : 1 }]}>
      <View style={{ flex: 2, flexDirection: "row", alignItems: "center" }}>
        <Text style={{ fontSize: 14, color: "#333" }}>{label}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <TouchableOpacity
          style={styles.dropdownButton}
          onPress={() => setIsOpen(!isOpen)}
        >
          <Text style={styles.dropdownButtonText}>
            {options.find((o) => o.value === value)?.label || value}
          </Text>
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownList}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={styles.dropdownItem}
                onPress={() => {
                  onSelect(opt.value);
                  setIsOpen(false);
                }}
              >
                <Text style={styles.dropdownItemText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

const DraggableMarker = ({
  x,
  y,
  scale,
  width,
  length,
  color,
  size = 12,
  onDrag,
  onDragStart,
  onDragEnd,
  isEditable = true,
  style,
}: {
  x: number;
  y: number;
  scale: number;
  width: number;
  length: number;
  color: string;
  size?: number;
  onDrag: (x: number, y: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  isEditable?: boolean;
  style?: any;
}) => {
  const startPosRef = useRef({ x: 0, y: 0 });
  const propsRef = useRef({ x, y, scale, width, length, onDrag });
  propsRef.current = { x, y, scale, width, length, onDrag };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isEditable,
      onMoveShouldSetPanResponder: () => isEditable,
      onPanResponderGrant: () => {
        startPosRef.current = { x: propsRef.current.x, y: propsRef.current.y };
        onDragStart?.();
      },
      onPanResponderMove: (evt, gestureState) => {
        const { scale, width, length, onDrag } = propsRef.current;
        if (scale === 0) return;

        const dx = gestureState.dx / scale;
        const dy = gestureState.dy / scale;

        const newX = Math.max(0, Math.min(width, startPosRef.current.x + dx));
        const newY = Math.max(0, Math.min(length, startPosRef.current.y + dy));

        onDrag(newX, newY);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: () => {
        onDragEnd?.();
      },
    }),
  ).current;

  return (
    <View
      style={[
        {
          position: "absolute",
          left: x * scale - size / 2,
          top: y * scale - size / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          borderWidth: 2,
          borderColor: "#fff",
          zIndex: 10,
          elevation: 10,
        },
        style,
      ]}
      hitSlop={{ top: 30, bottom: 30, left: 30, right: 30 }}
      {...panResponder.panHandlers}
    />
  );
};

const FieldVisualization = ({
  width,
  length,
  anchors,
  truePos,
  estPos,
  initialPopulation,
  finalPopulation,
  onUpdateTruePos,
  onUpdateAnchor,
  isRandomTruePos,
  onDragStart,
  onDragEnd,
  isRunning,
}: {
  width: number;
  length: number;
  anchors: AnchorGeometry[];
  truePos: { x: number; y: number };
  estPos?: { x: number; y: number };
  initialPopulation?: { x: number; y: number }[];
  finalPopulation?: { x: number; y: number }[];
  onUpdateTruePos: (x: number, y: number) => void;
  onUpdateAnchor: (index: number, x: number, y: number) => void;
  isRandomTruePos: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  isRunning: boolean;
}) => {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [showPopulation, setShowPopulation] = useState(true);

  const onLayout = (e: LayoutChangeEvent) => {
    setLayout(e.nativeEvent.layout);
  };

  const scale = layout.width > 0 ? layout.width / width : 0;
  const viewHeight = length * scale;

  return (
    <View style={styles.fieldContainer}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text style={styles.sectionTitle}>Field Visualization</Text>
        <TouchableOpacity onPress={() => setShowPopulation(!showPopulation)}>
          <Text style={{ color: ACCENT_COLOR }}>
            {showPopulation ? "Hide Population" : "Show Population"}
          </Text>
        </TouchableOpacity>
      </View>
      <View
        style={[styles.field, { height: viewHeight || 200 }]}
        onLayout={onLayout}
      >
        {/* Grid Lines (5m intervals) */}
        {scale > 0 &&
          Array.from({ length: Math.floor(width / 5) + 1 }).map((_, i) => (
            <View
              key={`v-${i}`}
              style={{
                position: "absolute",
                left: i * 5 * scale,
                top: 0,
                bottom: 0,
                width: 1,
                backgroundColor: "rgba(0,0,0,0.1)",
                zIndex: 1,
              }}
            />
          ))}
        {scale > 0 &&
          Array.from({ length: Math.floor(length / 5) + 1 }).map((_, i) => (
            <View
              key={`h-${i}`}
              style={{
                position: "absolute",
                top: i * 5 * scale,
                left: 0,
                right: 0,
                height: 1,
                backgroundColor: "rgba(0,0,0,0.1)",
                zIndex: 1,
              }}
            />
          ))}

        {/* Initial Population */}
        {showPopulation &&
          initialPopulation?.map((p, i) => (
            <View
              key={`init-${i}`}
              style={{
                position: "absolute",
                left: p.x * scale - 2,
                top: p.y * scale - 2,
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: "rgba(100, 100, 100, 0.3)",
                zIndex: 5,
              }}
            />
          ))}

        {/* Anchors */}
        {anchors.map((a, i) => (
          <DraggableMarker
            key={`anchor-${i}`}
            x={a.x}
            y={a.y}
            scale={scale}
            width={width}
            length={length}
            color="#333"
            onDrag={(x, y) => onUpdateAnchor(i, x, y)}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            isEditable={!isRunning}
            style={{ zIndex: 10, elevation: 10 }}
          />
        ))}

        {/* True Position */}
        <DraggableMarker
          x={truePos.x}
          y={truePos.y}
          scale={scale}
          width={width}
          length={length}
          color="#2e7d32"
          size={16}
          onDrag={onUpdateTruePos}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          isEditable={!isRunning}
          style={{
            borderColor: isRandomTruePos ? "#fff" : "#000",
            borderWidth: isRandomTruePos ? 2 : 3,
            zIndex: 20,
            elevation: 20,
          }}
        />

        {/* Estimated Position */}
        {estPos && (
          <View
            style={{
              position: "absolute",
              left: estPos.x * scale - 8,
              top: estPos.y * scale - 8,
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: "#d32f2f",
              borderWidth: 2,
              borderColor: "#fff",
              zIndex: 30,
              elevation: 30,
            }}
          />
        )}

        {/* Final Population */}
        {showPopulation &&
          finalPopulation?.map((p, i) => (
            <View
              key={`final-${i}`}
              style={{
                position: "absolute",
                left: p.x * scale - 3,
                top: p.y * scale - 3,
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: "rgba(255, 165, 0, 0.6)", // Orange
                zIndex: 40,
                elevation: 40,
              }}
            />
          ))}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View
            style={[styles.legendMarkerBase, { backgroundColor: "#333" }]}
          />
          <Text style={styles.legendText}>Anchor</Text>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[styles.legendMarkerBase, { backgroundColor: "#2e7d32" }]}
          />
          <Text style={styles.legendText}>
            True Position {isRandomTruePos ? "(Random)" : "(Drag)"}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[styles.legendMarkerBase, { backgroundColor: "#d32f2f" }]}
          />
          <Text style={styles.legendText}>Estimated Position</Text>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[
              styles.legendMarkerBase,
              { backgroundColor: "rgba(100, 100, 100, 0.3)" },
            ]}
          />
          <Text style={styles.legendText}>Initial Population</Text>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[
              styles.legendMarkerBase,
              { backgroundColor: "rgba(255, 165, 0, 0.6)" },
            ]}
          />
          <Text style={styles.legendText}>Final Population</Text>
        </View>
      </View>
    </View>
  );
};
export default function OptimizationTestScreen() {
  // Configuration State
  const [fieldWidth, setFieldWidth] = useState(
    DEFAULT_FIELD_DIMENSIONS.widthMeters.toString(),
  );
  const [fieldLength, setFieldLength] = useState(
    DEFAULT_FIELD_DIMENSIONS.lengthMeters.toString(),
  );
  const [numAnchors, setNumAnchors] = useState("8");

  const [txHeight, setTxHeight] = useState(
    DEFAULT_PROPAGATION_CONSTANTS.transmitterHeightMeters.toString(),
  );
  const [rxHeight, setRxHeight] = useState(
    DEFAULT_PROPAGATION_CONSTANTS.receiverHeightMeters.toString(),
  );
  const [freq, setFreq] = useState(
    DEFAULT_PROPAGATION_CONSTANTS.frequencyHz.toString(),
  );
  const [txGain, setTxGain] = useState(
    DEFAULT_PROPAGATION_CONSTANTS.transmitterGain.toString(),
  );
  const [rxGain, setRxGain] = useState(
    DEFAULT_PROPAGATION_CONSTANTS.receiverGain.toString(),
  );
  const [refCoeff, setRefCoeff] = useState(
    DEFAULT_PROPAGATION_CONSTANTS.reflectionCoefficient.toString(),
  );

  const [timeBudget, setTimeBudget] = useState(
    DEFAULT_MFASA_OPTIONS.timeBudgetMs.toString(),
  ); // Default total time
  const [maxIterations, setMaxIterations] = useState(
    DEFAULT_MFASA_OPTIONS.maxIterations.toString(),
  );
  const [populationSize, setPopulationSize] = useState(
    DEFAULT_MFASA_OPTIONS.populationSize.toString(),
  );
  const [beta0, setBeta0] = useState(DEFAULT_MFASA_OPTIONS.beta0.toString());
  const [lightAbsorption, setLightAbsorption] = useState(
    DEFAULT_MFASA_OPTIONS.lightAbsorption.toString(),
  );
  const [alpha, setAlpha] = useState(DEFAULT_MFASA_OPTIONS.alpha.toString());
  const [initialTemperature, setInitialTemperature] = useState(
    DEFAULT_MFASA_OPTIONS.initialTemperature.toString(),
  );
  const [coolingRate, setCoolingRate] = useState(
    DEFAULT_MFASA_OPTIONS.coolingRate.toString(),
  );

  const [selectedModel, setSelectedModel] = useState("LogNormal");
  const [selectedAlgorithm, setSelectedAlgorithm] = useState("MFASA");
  const [selectedFilter, setSelectedFilter] = useState("Kalman");

  // True Position State
  const [isRandomTruePos, setIsRandomTruePos] = useState(true);
  const [manualTrueX, setManualTrueX] = useState("25");
  const [manualTrueY, setManualTrueY] = useState("15");
  const [currentTruePos, setCurrentTruePos] = useState({ x: 25, y: 15 });

  // Anchor State
  const [anchorPlacementMode, setAnchorPlacementMode] = useState<
    "random" | "border" | "grid"
  >("border");
  const [currentAnchors, setCurrentAnchors] = useState<AnchorGeometry[]>([]);

  const [numRuns, setNumRuns] = useState("10");
  const [batchResults, setBatchResults] = useState<{
    avgError: number;
    maxError: number;
    minError: number;
    stdDev: number;
    avgTime: number;
    runs: number;
  } | null>(null);

  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [lastEstPos, setLastEstPos] = useState<
    { x: number; y: number } | undefined
  >(undefined);
  const [initialPopulation, setInitialPopulation] = useState<
    { x: number; y: number }[] | undefined
  >(undefined);
  const [finalPopulation, setFinalPopulation] = useState<
    { x: number; y: number }[] | undefined
  >(undefined);

  const [scrollEnabled, setScrollEnabled] = useState(true);

  const addLog = (msg: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  };

  const generateAnchors = useCallback(() => {
    const w = parseFloat(fieldWidth) || DEFAULT_FIELD_DIMENSIONS.widthMeters;
    const l = parseFloat(fieldLength) || DEFAULT_FIELD_DIMENSIONS.lengthMeters;
    const n = parseInt(numAnchors) || 8;

    const newAnchors: AnchorGeometry[] = [];

    if (anchorPlacementMode === "random") {
      for (let i = 0; i < n; i++) {
        newAnchors.push({
          mac: `00:11:22:33:44:0${i}`,
          x: Math.random() * w,
          y: Math.random() * l,
        });
      }
    } else if (anchorPlacementMode === "grid") {
      const ratio = l / w;
      const cols = Math.ceil(Math.sqrt(n / ratio));
      const rows = Math.ceil(n / cols);
      const stepX = w / cols;
      const stepY = l / rows;

      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        // Center in the grid cell
        const x = (c + 0.5) * stepX;
        const y = (r + 0.5) * stepY;
        // Clamp to field
        newAnchors.push({
          mac: `00:11:22:33:44:0${i}`,
          x: Math.min(w, Math.max(0, x)),
          y: Math.min(l, Math.max(0, y)),
        });
      }
    } else {
      // Border
      const perimeter = 2 * (w + l);
      const step = perimeter / n;
      for (let i = 0; i < n; i++) {
        const dist = i * step;
        let x = 0,
          y = 0;
        if (dist < w) {
          x = dist;
          y = 0;
        } else if (dist < w + l) {
          x = w;
          y = dist - w;
        } else if (dist < 2 * w + l) {
          x = w - (dist - (w + l));
          y = l;
        } else {
          x = 0;
          y = l - (dist - (2 * w + l));
        }
        newAnchors.push({
          mac: `00:11:22:33:44:0${i}`,
          x,
          y,
        });
      }
    }
    setCurrentAnchors(newAnchors);
  }, [fieldWidth, fieldLength, numAnchors, anchorPlacementMode]);

  useEffect(() => {
    generateAnchors();
  }, [generateAnchors]);

  const performSimulation = useCallback(
    async (
      runIndex: number,
      totalRuns: number,
    ): Promise<{
      errorDist: number;
      duration: number;
      result: any;
      trueX: number;
      trueY: number;
    }> => {
      // Parse Config
      const width = parseFloat(fieldWidth) || 100;
      const length = parseFloat(fieldLength) || 100;

      const constants: PropagationConstants = {
        transmitterHeightMeters:
          parseFloat(txHeight) ||
          DEFAULT_PROPAGATION_CONSTANTS.transmitterHeightMeters,
        receiverHeightMeters:
          parseFloat(rxHeight) ||
          DEFAULT_PROPAGATION_CONSTANTS.receiverHeightMeters,
        frequencyHz:
          parseFloat(freq) || DEFAULT_PROPAGATION_CONSTANTS.frequencyHz,
        transmitterGain:
          parseFloat(txGain) || DEFAULT_PROPAGATION_CONSTANTS.transmitterGain,
        receiverGain:
          parseFloat(rxGain) || DEFAULT_PROPAGATION_CONSTANTS.receiverGain,
        reflectionCoefficient:
          parseFloat(refCoeff) ||
          DEFAULT_PROPAGATION_CONSTANTS.reflectionCoefficient,
      };

      const bounds: SearchBounds = {
        xMin: 0,
        xMax: width,
        yMin: 0,
        yMax: length,
      };

      const tBudget =
        parseFloat(timeBudget) || DEFAULT_MFASA_OPTIONS.timeBudgetMs;
      const maxIter =
        parseInt(maxIterations) || DEFAULT_MFASA_OPTIONS.maxIterations;
      const popSize =
        parseInt(populationSize) || DEFAULT_MFASA_OPTIONS.populationSize;
      const b0 = parseFloat(beta0) || DEFAULT_MFASA_OPTIONS.beta0;
      const gamma =
        parseFloat(lightAbsorption) || DEFAULT_MFASA_OPTIONS.lightAbsorption;
      const alp = parseFloat(alpha) || DEFAULT_MFASA_OPTIONS.alpha;
      const initTemp =
        parseFloat(initialTemperature) ||
        DEFAULT_MFASA_OPTIONS.initialTemperature;
      const coolRate =
        parseFloat(coolingRate) || DEFAULT_MFASA_OPTIONS.coolingRate;

      // 1. Setup Model
      let model;
      if (selectedModel === "TwoRayGround") {
        model = new TwoRayGroundModel();
      } else {
        model = new LogNormalModel();
      }

      // 2. Setup Optimizer
      let optimizer;
      if (selectedAlgorithm === "MFASA") {
        optimizer = new MFASAOptimizer({
          totalTimeLimitMs: tBudget,
          maxIterations: maxIter,
          populationSize: popSize,
          beta0: b0,
          lightAbsorption: gamma,
          alpha: alp,
          initialTemperature: initTemp,
          coolingRate: coolRate,
        });
      } else {
        optimizer = new MFASAOptimizer({
          totalTimeLimitMs: tBudget,
          maxIterations: maxIter,
        });
      }

      // 3. Generate Scenario
      let trueX, trueY;
      if (isRandomTruePos) {
        trueX = Math.random() * width;
        trueY = Math.random() * length;
        // Only update UI state on the first run to avoid flickering
        if (runIndex === 0) {
          setCurrentTruePos({ x: trueX, y: trueY });
          setManualTrueX(trueX.toFixed(2));
          setManualTrueY(trueY.toFixed(2));
        }
      } else {
        trueX = parseFloat(manualTrueX) || width / 2;
        trueY = parseFloat(manualTrueY) || length / 2;
        if (runIndex === 0) {
          setCurrentTruePos({ x: trueX, y: trueY });
        }
      }

      if (runIndex === 0) {
        addLog(`True Position: (${trueX.toFixed(2)}, ${trueY.toFixed(2)})`);
      }

      const candidates: BeaconMeasurement[] = [];
      const SAMPLE_COUNT = 20; // Simulate receiving 20 packets

      // Use currentAnchors state
      currentAnchors.forEach((anchor) => {
        // Calculate true distance
        const dist = Math.sqrt(
          (trueX - anchor.x) ** 2 + (trueY - anchor.y) ** 2,
        );

        // Calculate RSSI using the model
        const txPower = DEFAULT_TX_POWER_DBM;
        const trueRssi = model.estimateRssi({
          distanceMeters: dist,
          txPowerDbm: txPower,
          constants: constants,
        });

        // Initialize Kalman Filter for this anchor
        // Process noise 0.01, Measurement noise 4.0 (standard deviation of RSSI noise ~2dBm)
        const kf = new KalmanFilter({
          processNoise: 0.01,
          measurementNoise: 4.0,
        });

        let filteredRssi = trueRssi;

        // Simulate a stream of noisy packets
        for (let i = 0; i < SAMPLE_COUNT; i++) {
          // Simple Gaussian noise approximation
          const u1 = Math.random();
          const u2 = Math.random();
          const z =
            Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
          const noise = z * 2.0; // Standard deviation of 2.0 dBm

          const noisyRssi = trueRssi + noise;
          filteredRssi = kf.filterSample(noisyRssi);
        }

        candidates.push({
          mac: anchor.mac,
          lastSeen: Date.now(),
          filteredRssi: filteredRssi,
          txPower: txPower,
        });
      });

      if (runIndex === 0) {
        addLog(
          `Using ${currentAnchors.length} anchors. Simulated ${SAMPLE_COUNT} packets per anchor.`,
        );
      }

      // 4. Run Optimizer
      const startTime = performance.now();
      const result = await optimizer.solve({
        candidate: candidates,
        anchors: currentAnchors,
        propagation: model,
        constants: constants,
        bounds: bounds,
        totalTimeLimitMs: tBudget,
      });
      const endTime = performance.now();
      const duration = endTime - startTime;

      // 5. Report Results
      const errorDist = Math.sqrt(
        (result.x - trueX) ** 2 + (result.y - trueY) ** 2,
      );

      return { errorDist, duration, result, trueX, trueY };
    },
    [
      fieldWidth,
      fieldLength,
      txHeight,
      rxHeight,
      freq,
      txGain,
      rxGain,
      refCoeff,
      timeBudget,
      maxIterations,
      populationSize,
      beta0,
      lightAbsorption,
      alpha,
      initialTemperature,
      coolingRate,
      selectedModel,
      selectedAlgorithm,
      isRandomTruePos,
      manualTrueX,
      manualTrueY,
      currentAnchors,
    ],
  );

  const runTest = useCallback(async () => {
    setIsRunning(true);
    // setLastResult(null);
    // setLastEstPos(undefined);
    // setBatchResults(null);
    addLog("Starting Optimization Test...");

    try {
      const { errorDist, duration, result, trueX, trueY } =
        await performSimulation(0, 1);

      setLastEstPos({ x: result.x, y: result.y });
      setInitialPopulation(result.diagnostics?.initialPopulation);
      setFinalPopulation(result.diagnostics?.finalPopulation);

      const resultMsg = `
Time: ${duration.toFixed(2)}ms
True: (${trueX.toFixed(2)}, ${trueY.toFixed(2)})
Est: (${result.x.toFixed(2)}, ${result.y.toFixed(2)})
Error: ${errorDist.toFixed(2)}m
Evaluations: ${result.diagnostics?.evaluations ?? "N/A"}
Initial Error (RMSE): ${result.diagnostics?.initialError.toFixed(2) ?? "N/A"}
Final Error (RMSE): ${result.diagnostics?.finalError.toFixed(2) ?? "N/A"}
      `.trim();

      setLastResult(resultMsg);
      addLog(
        `Test Complete. Duration: ${duration.toFixed(
          2,
        )}ms. Error: ${errorDist.toFixed(2)}m\n${resultMsg}`,
      );
    } catch (e: any) {
      addLog(`Error: ${e.message}`);
      console.error(e);
    } finally {
      setIsRunning(false);
    }
  }, [performSimulation]);

  const runBatchTest = useCallback(async () => {
    const n = parseInt(numRuns) || 10;
    if (n <= 0) return;

    setIsRunning(true);
    // setLastResult(null);
    // setLastEstPos(undefined);
    // setBatchResults(null);
    addLog(`Starting Batch Test (${n} runs)...`);

    const errors: number[] = [];
    const times: number[] = [];

    try {
      for (let i = 0; i < n; i++) {
        // Allow UI to update
        await new Promise((resolve) => setTimeout(resolve, 0));

        const { errorDist, duration, result } = await performSimulation(i, n);
        errors.push(errorDist);
        times.push(duration);

        addLog(
          `Run ${i + 1}/${n}: Error=${errorDist.toFixed(
            2,
          )}m, Time=${duration.toFixed(2)}ms, Est=(${result.x.toFixed(
            2,
          )}, ${result.y.toFixed(2)})`,
        );

        if (i === n - 1) {
          // Update visualization for the last run
          setLastEstPos({ x: result.x, y: result.y });
          setInitialPopulation(result.diagnostics?.initialPopulation);
          setFinalPopulation(result.diagnostics?.finalPopulation);
        }
      }

      const avgError = errors.reduce((a, b) => a + b, 0) / n;
      const maxError = Math.max(...errors);
      const minError = Math.min(...errors);
      const avgTime = times.reduce((a, b) => a + b, 0) / n;

      // Calculate Standard Deviation
      const variance = errors.reduce((a, b) => a + (b - avgError) ** 2, 0) / n;
      const stdDev = Math.sqrt(variance);

      setBatchResults({
        avgError,
        maxError,
        minError,
        stdDev,
        avgTime,
        runs: n,
      });

      addLog(
        `Batch Complete. Avg Error: ${avgError.toFixed(
          2,
        )}m, Max: ${maxError.toFixed(2)}m`,
      );
    } catch (e: any) {
      addLog(`Batch Error: ${e.message}`);
      console.error(e);
    } finally {
      setIsRunning(false);
    }
  }, [numRuns, performSimulation]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollContainer} scrollEnabled={scrollEnabled}>
        <View style={styles.header}>
          <Text style={styles.title}>Optimization Test</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Configuration</Text>
          <Dropdown
            label="Model"
            value={selectedModel}
            options={[
              { label: "Log Normal", value: "LogNormal" },
              { label: "Two Ray Ground", value: "TwoRayGround" },
            ]}
            onSelect={setSelectedModel}
          />
          <Dropdown
            label="Algorithm"
            value={selectedAlgorithm}
            options={[{ label: "MFASA", value: "MFASA" }]}
            onSelect={setSelectedAlgorithm}
          />
          <Dropdown
            label="RSSI Filter"
            value={selectedFilter}
            options={[{ label: "Kalman", value: "Kalman" }]}
            onSelect={setSelectedFilter}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>True Position</Text>
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setIsRandomTruePos(!isRandomTruePos)}
          >
            <View
              style={[
                styles.checkbox,
                isRandomTruePos && styles.checkboxChecked,
              ]}
            >
              {isRandomTruePos && (
                <Text style={{ color: "#fff", fontSize: 12 }}>✓</Text>
              )}
            </View>
            <Text style={styles.inputLabel}>Randomly Select True Position</Text>
          </TouchableOpacity>

          {!isRandomTruePos && (
            <>
              <InputRow
                label="True X (m)"
                value={manualTrueX}
                onChange={(v) => {
                  setManualTrueX(v);
                  setCurrentTruePos((p) => ({ ...p, x: parseFloat(v) || 0 }));
                }}
              />
              <InputRow
                label="True Y (m)"
                value={manualTrueY}
                onChange={(v) => {
                  setManualTrueY(v);
                  setCurrentTruePos((p) => ({ ...p, y: parseFloat(v) || 0 }));
                }}
              />
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Field & Anchors</Text>
          <InputRow
            label="Width (m)"
            value={fieldWidth}
            onChange={setFieldWidth}
          />
          <InputRow
            label="Length (m)"
            value={fieldLength}
            onChange={setFieldLength}
          />
          <InputRow
            label="Number of Anchors"
            value={numAnchors}
            onChange={setNumAnchors}
          />
          <Dropdown
            label="Anchor Placement"
            value={anchorPlacementMode}
            options={[
              { label: "Border", value: "border" },
              { label: "Grid", value: "grid" },
              { label: "Random", value: "random" },
            ]}
            onSelect={(v) => setAnchorPlacementMode(v as any)}
          />

          <Text style={styles.sectionTitle}>Propagation Constants</Text>
          <InputRow
            label="Transmitter Height (m)"
            value={txHeight}
            onChange={setTxHeight}
            tooltip="Height of the beacon from the ground. Affects ground reflection path."
          />
          <InputRow
            label="Receiver Height (m)"
            value={rxHeight}
            onChange={setRxHeight}
            tooltip="Height of the phone from the ground. Affects ground reflection path."
          />
          <InputRow
            label="Frequency (Hz)"
            value={freq}
            onChange={setFreq}
            tooltip="Signal frequency (usually 2.4GHz for BLE). Affects wavelength and path loss."
          />
          <InputRow
            label="Transmitter Gain"
            value={txGain}
            onChange={setTxGain}
            tooltip="Antenna gain of the beacon (linear scale)."
          />
          <InputRow
            label="Receiver Gain"
            value={rxGain}
            onChange={setRxGain}
            tooltip="Antenna gain of the phone (linear scale)."
          />
          <InputRow
            label="Reflection Coefficient"
            value={refCoeff}
            onChange={setRefCoeff}
            tooltip="How much signal is reflected by the ground (0-1). 1 means perfect reflection."
          />

          <Text style={styles.sectionTitle}>Optimizer</Text>
          <InputRow
            label="Total Time Limit (ms)"
            value={timeBudget}
            onChange={setTimeBudget}
            tooltip="Maximum time allowed for the optimization process."
          />
          <InputRow
            label="Max Iterations"
            value={maxIterations}
            onChange={setMaxIterations}
            tooltip="Maximum number of optimization steps."
          />
          <InputRow
            label="Population Size"
            value={populationSize}
            onChange={setPopulationSize}
            tooltip="Number of candidate positions ('fireflies') in the swarm. Larger population explores better but is slower."
          />
          <InputRow
            label="Beta0"
            value={beta0}
            onChange={setBeta0}
            tooltip="Attractiveness at distance 0. Controls how strongly fireflies are attracted to brighter ones."
          />
          <InputRow
            label="Light Absorption"
            value={lightAbsorption}
            onChange={setLightAbsorption}
            tooltip="Controls how quickly attractiveness decreases with distance. High values mean local search, low values mean global search."
          />
          <InputRow
            label="Alpha"
            value={alpha}
            onChange={setAlpha}
            tooltip="Randomization parameter. Controls the randomness of movement."
          />
          <InputRow
            label="Initial Temperature"
            value={initialTemperature}
            onChange={setInitialTemperature}
            tooltip="Starting temperature for Simulated Annealing. Higher means more random movement initially."
          />
          <InputRow
            label="Cooling Rate"
            value={coolingRate}
            onChange={setCoolingRate}
            tooltip="How fast the temperature decreases (0-1). Closer to 1 means slower cooling."
          />
        </View>

        <View style={styles.controls}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <TouchableOpacity
              style={[styles.button, isRunning && styles.buttonDisabled]}
              onPress={runTest}
              disabled={isRunning}
            >
              <Text style={styles.buttonText}>
                {isRunning ? "Running..." : "Run Single Test"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", marginBottom: 5 }}>
              <TouchableOpacity
                style={[
                  styles.button,
                  isRunning && styles.buttonDisabled,
                  { flex: 2, marginRight: 5 },
                ]}
                onPress={runBatchTest}
                disabled={isRunning}
              >
                <Text style={styles.buttonText}>Batch Run</Text>
              </TouchableOpacity>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={numRuns}
                onChangeText={setNumRuns}
                keyboardType="numeric"
                placeholder="Runs"
              />
            </View>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <TouchableOpacity
            style={[
              styles.button,
              { marginRight: 10, backgroundColor: "#666" },
            ]}
            onPress={() => setShowLogs(!showLogs)}
          >
            <Text style={styles.buttonText}>
              {showLogs ? "Hide Logs" : "Show Logs"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: "#d32f2f" }]}
            onPress={() => setLogs([])}
          >
            <Text style={styles.buttonText}>Clear Logs</Text>
          </TouchableOpacity>
        </View>

        <FieldVisualization
          width={parseFloat(fieldWidth) || 100}
          length={parseFloat(fieldLength) || 100}
          anchors={currentAnchors}
          truePos={currentTruePos}
          estPos={lastEstPos}
          initialPopulation={initialPopulation}
          finalPopulation={finalPopulation}
          isRandomTruePos={isRandomTruePos}
          isRunning={isRunning}
          onUpdateTruePos={(x, y) => {
            setManualTrueX(x.toFixed(2));
            setManualTrueY(y.toFixed(2));
            setCurrentTruePos({ x, y });
          }}
          onUpdateAnchor={(index, x, y) => {
            const newAnchors = [...currentAnchors];
            newAnchors[index] = { ...newAnchors[index], x, y };
            setCurrentAnchors(newAnchors);
          }}
          onDragStart={() => setScrollEnabled(false)}
          onDragEnd={() => setScrollEnabled(true)}
        />

        {batchResults && (
          <View style={styles.resultBox}>
            <Text
              style={[
                styles.resultText,
                { fontWeight: "bold", marginBottom: 5 },
              ]}
            >
              Batch Results ({batchResults.runs} runs)
            </Text>
            <Text style={styles.resultText}>
              Avg Error: {batchResults.avgError.toFixed(2)}m
            </Text>
            <Text style={styles.resultText}>
              Max Error: {batchResults.maxError.toFixed(2)}m
            </Text>
            <Text style={styles.resultText}>
              Min Error: {batchResults.minError.toFixed(2)}m
            </Text>
            <Text style={styles.resultText}>
              Std Dev: {batchResults.stdDev.toFixed(2)}m
            </Text>
            <Text style={styles.resultText}>
              Avg Time: {batchResults.avgTime.toFixed(2)}ms
            </Text>
          </View>
        )}

        {lastResult && (
          <View style={styles.resultBox}>
            <Text style={styles.resultText}>{lastResult}</Text>
          </View>
        )}

        {showLogs && (
          <View style={styles.logsContainer}>
            <Text style={styles.logsTitle}>Logs:</Text>
            {logs.map((log, i) => (
              <Text key={i} style={styles.logText}>
                {log}
              </Text>
            ))}
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Main Container
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  scrollContainer: {
    flex: 1,
    padding: 20,
  },
  header: {
    marginBottom: 20,
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
  },
  section: {
    marginBottom: 20,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 10,
    marginBottom: 5,
    color: ACCENT_COLOR,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  inputLabel: {
    flex: 1,
    fontSize: 14,
    color: "#333",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 4,
    padding: 5,
    fontSize: 14,
    backgroundColor: "#fafafa",
    maxWidth: 100,
  },
  dropdownButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 4,
    padding: 8,
    backgroundColor: "#fafafa",
  },
  dropdownButtonText: {
    fontSize: 14,
    color: "#333",
  },
  dropdownList: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 4,
    marginTop: 2,
    zIndex: 1000,
    elevation: 5,
  },
  dropdownItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  dropdownItemText: {
    fontSize: 14,
    color: "#333",
  },
  controls: {
    flexDirection: "row",
    marginBottom: 20,
    justifyContent: "center",
  },
  button: {
    flex: 1,
    backgroundColor: ACCENT_COLOR,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  resultBox: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  resultText: {
    fontSize: 14,
    color: "#333",
    fontFamily: "monospace",
  },
  logsContainer: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  logsTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
  },
  logText: {
    fontSize: 12,
    marginBottom: 4,
    color: "#333",
  },
  fieldContainer: {
    marginBottom: 20,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  field: {
    backgroundColor: "#eee",
    borderWidth: 1,
    borderColor: "#ccc",
    position: "relative",
    marginBottom: 10,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "space-around",
    flexWrap: "wrap",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
    marginBottom: 5,
  },
  legendText: {
    fontSize: 12,
    color: "#333",
  },
  legendMarkerBase: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#fff",
    marginRight: 8,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: "#ccc",
    marginRight: 10,
    backgroundColor: "#fafafa",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: ACCENT_COLOR,
  },
});
