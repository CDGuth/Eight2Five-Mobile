import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
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
  ActivityIndicator,
  Modal,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { captureRef } from "react-native-view-shot";
import { MFASAOptimizer } from "../localization/algorithms/MFASA";
import { LogNormalModel } from "../localization/models/LogNormalModel";
import { TwoRayGroundModel } from "../localization/models/TwoRayGroundModel";
import { KalmanFilter } from "../localization/filters/KalmanFilter";
import {
  DEFAULT_PROPAGATION_CONSTANTS,
  DEFAULT_FIELD_DIMENSIONS,
  DEFAULT_MFASA_OPTIONS,
  DEFAULT_TX_POWER_DBM,
  DEFAULT_SIMULATION_NOISE,
  DEFAULT_KALMAN_CONFIG,
} from "../localization/LocalizationConfig";
import {
  AnchorGeometry,
  BeaconMeasurement,
  PropagationConstants,
  SearchBounds,
} from "../localization/types";

const ACCENT_COLOR = "#3C6EC8";

const FIELD_PRESETS = [
  { label: "Custom", value: "custom", width: 100, length: 100 },
  {
    label: "Football Field",
    value: "football",
    width: 109.73,
    length: 48.77,
  },
];

const CollapsibleSection = ({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setIsOpen(!isOpen)}
        activeOpacity={0.7}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.collapseIcon}>{isOpen ? "−" : "+"}</Text>
      </TouchableOpacity>
      {isOpen && <View style={styles.sectionContent}>{children}</View>}
    </View>
  );
};

const LabelWithTooltip = ({
  label,
  tooltip,
}: {
  label: string;
  tooltip?: string;
}) => (
  <View style={styles.labelContainer}>
    <Text style={styles.labelText}>{label}</Text>
    {tooltip && (
      <TouchableOpacity
        onPress={() => Alert.alert(label, tooltip)}
        style={{ marginLeft: 6 }}
      >
        <View
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: "#eee",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "#ddd",
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: "bold", color: "#888" }}>
            ?
          </Text>
        </View>
      </TouchableOpacity>
    )}
  </View>
);

const InputRow = ({
  label,
  value,
  onChange,
  tooltip,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  tooltip?: string;
  disabled?: boolean;
}) => (
  <View style={[styles.inputRow, disabled && { opacity: 0.5 }]}>
    <LabelWithTooltip label={label} tooltip={tooltip} />
    <View style={styles.controlWrapper}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholderTextColor="#999"
        editable={!disabled}
      />
    </View>
  </View>
);

const Dropdown = ({
  label,
  value,
  options,
  onSelect,
  disabled = false,
  onToggle,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onSelect: (v: string) => void;
  disabled?: boolean;
  onToggle?: (isOpen: boolean) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuLayout, setMenuLayout] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const buttonRef = useRef<any>(null);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    onToggle?.(false);
  }, [onToggle]);

  const updateMenuLayout = useCallback(() => {
    requestAnimationFrame(() => {
      buttonRef.current?.measureInWindow(
        (x: number, y: number, width: number, height: number) => {
          setMenuLayout({ x, y: y + height, width, height });
        },
      );
    });
  }, []);

  const openMenu = useCallback(() => {
    if (disabled) return;
    onToggle?.(true);
    requestAnimationFrame(() => {
      buttonRef.current?.measureInWindow(
        (x: number, y: number, width: number, height: number) => {
          setMenuLayout({ x, y: y + height, width, height });
          setIsOpen(true);
        },
      );
    });
  }, [disabled, onToggle]);

  const handleToggle = () => {
    if (isOpen) {
      closeMenu();
      return;
    }
    openMenu();
  };

  const handleSelect = (val: string) => {
    onSelect(val);
    closeMenu();
  };

  return (
    <View
      style={[
        styles.inputRow,
        { zIndex: isOpen ? 1000 : 1, elevation: isOpen ? 50 : 0 },
        disabled && { opacity: 0.5 },
      ]}
    >
      {label ? (
        <LabelWithTooltip label={label} />
      ) : (
        <View style={{ flex: 1 }} />
      )}
      <View style={styles.controlWrapper}>
        <TouchableOpacity
          ref={buttonRef}
          style={styles.dropdownButton}
          onPress={() => !disabled && handleToggle()}
          onLayout={updateMenuLayout}
          disabled={disabled}
        >
          <Text style={styles.dropdownButtonText} numberOfLines={1}>
            {options.find((o) => o.value === value)?.label || value}
          </Text>
        </TouchableOpacity>
        {isOpen && (
          <Modal
            transparent
            animationType="fade"
            visible={isOpen}
            onRequestClose={closeMenu}
          >
            <View
              style={styles.dropdownModalContainer}
              pointerEvents="box-none"
            >
              <Pressable style={styles.dropdownBackdrop} onPress={closeMenu} />
              <View
                style={[
                  styles.dropdownList,
                  styles.dropdownModalList,
                  {
                    top: menuLayout.y,
                    left: menuLayout.x,
                    width: menuLayout.width || 140,
                  },
                ]}
              >
                <ScrollView
                  style={{ maxHeight: 220 }}
                  nestedScrollEnabled={true}
                  keyboardShouldPersistTaps="always"
                  persistentScrollbar={true}
                >
                  {options.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={styles.dropdownItem}
                      onPress={() => handleSelect(opt.value)}
                    >
                      <Text style={styles.dropdownItemText}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Modal>
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
  const isEditableRef = useRef(isEditable);
  isEditableRef.current = isEditable;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isEditableRef.current,
      onMoveShouldSetPanResponder: () => isEditableRef.current,
      onPanResponderGrant: () => {
        if (!isEditableRef.current) return;
        startPosRef.current = { x: propsRef.current.x, y: propsRef.current.y };
        onDragStart?.();
      },
      onPanResponderMove: (evt, gestureState) => {
        if (!isEditableRef.current) return;
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
        },
        style,
      ]}
      hitSlop={{ top: 30, bottom: 30, left: 30, right: 30 }}
      {...panResponder.panHandlers}
    />
  );
};

// --- Types ---

type TestMode = "standard" | "sweep";

interface SweepConfig {
  param: string;
  min: string;
  max: string;
  step: string;
  runsPerStep: string;
}

interface RunResult {
  id: number;
  params: any;
  truePos: { x: number; y: number };
  estPos: { x: number; y: number };
  error: number;
  rssiRmse: number;
  duration: number;
  iterations: number;
  initialPopulation?: { x: number; y: number }[];
  finalPopulation?: { x: number; y: number }[];
  anchors: AnchorGeometry[];
  measurements: BeaconMeasurement[];
  modelType: string;
  constants: PropagationConstants;
  diagnostics?: any;
}

interface SweepStepResult {
  val: number;
  avgError: number;
  stdDev: number;
  avgIterations: number;
  runs: RunResult[];
}

interface BatchAnalysis {
  avgError: number;
  stdDev: number;
  rmse: number;
  avgRssiRmse: number;
  medianError: number;
  minError: number;
  maxError: number;
  avgDuration: number;
  avgIterations: number;
  successRate1m: number;
  successRate2m: number;
  totalRuns: number;
  bestRuns: RunResult[];
}

interface LogEntry {
  timestamp: number;
  message: string;
}

interface LogBatch {
  id: number;
  startTime: number;
  entries: LogEntry[];
  type: string;
}

const HeatmapOverlay = ({
  width,
  length,
  scale,
  result,
}: {
  width: number;
  length: number;
  scale: number;
  result: RunResult;
}) => {
  const resolution = 50; // 50x50 grid
  const stepX = width / resolution;
  const stepY = length / resolution;

  const heatmapData = useMemo(() => {
    if (!result) return null;

    const data = [];
    let minError = Infinity;
    let maxError = -Infinity;

    // Reconstruct model
    let model;
    if (result.modelType === "TwoRayGround") {
      model = new TwoRayGroundModel();
    } else {
      model = new LogNormalModel();
    }

    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        const x = (i + 0.5) * stepX;
        const y = (j + 0.5) * stepY;

        let errorSum = 0;
        let count = 0;

        for (const m of result.measurements) {
          const anchor = result.anchors.find((a) => a.mac === m.mac);
          if (anchor) {
            const dist = Math.sqrt((x - anchor.x) ** 2 + (y - anchor.y) ** 2);
            const predictedRssi = model.estimateRssi({
              distanceMeters: dist,
              txPowerDbm: m.txPower || DEFAULT_TX_POWER_DBM,
              constants: result.constants,
            });
            errorSum += (predictedRssi - m.filteredRssi) ** 2;
            count++;
          }
        }

        const rmse = count > 0 ? Math.sqrt(errorSum / count) : 0;
        minError = Math.min(minError, rmse);
        maxError = Math.max(maxError, rmse);

        data.push({ x, y, error: rmse });
      }
    }

    return { data, minError, maxError };
  }, [result, stepX, stepY]);

  if (!heatmapData) return null;

  const { data, minError, maxError } = heatmapData;
  const range = maxError - minError || 1;

  const getColor = (error: number) => {
    // Normalize 0-1
    const t = (error - minError) / range;
    // Purple (low error) to Yellow (high error)
    // Purple: rgb(128, 0, 128) -> Yellow: rgb(255, 255, 0)
    const r = Math.floor(128 + t * (255 - 128));
    const g = Math.floor(0 + t * 255);
    const b = Math.floor(128 + t * (0 - 128));
    return `rgba(${r}, ${g}, ${b}, 0.6)`;
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {data.map((cell, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: (cell.x - stepX / 2) * scale,
            top: (cell.y - stepY / 2) * scale,
            width: stepX * scale,
            height: stepY * scale,
            backgroundColor: getColor(cell.error),
          }}
        />
      ))}
    </View>
  );
};

const SweepGraph = ({
  results,
  paramName,
  onSelectPoint,
  selectedIndex,
}: {
  results: SweepStepResult[];
  paramName: string;
  onSelectPoint?: (index: number) => void;
  selectedIndex?: number | null;
}) => {
  const [width, setWidth] = useState(0);
  const data = useMemo(() => {
    return [...results].sort((a, b) => a.val - b.val);
  }, [results]);

  if (data.length < 1) return null;

  const minX = Math.min(...data.map((d) => d.val));
  const maxX = Math.max(...data.map((d) => d.val));
  const minY = 0;
  const maxY =
    Math.max(...data.map((d) => d.avgError + (d.stdDev || 0))) * 1.1 || 1;

  const graphHeight = 200;
  const graphWidth = width > 60 ? width - 60 : 0;

  const getX = (x: number) =>
    maxX === minX ? 0 : ((x - minX) / (maxX - minX)) * graphWidth;
  const getY = (y: number) =>
    graphHeight - ((y - minY) / (maxY - minY)) * graphHeight;

  return (
    <View
      style={{ marginTop: 10, marginBottom: 30, paddingLeft: 40 }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <Text
        style={[
          styles.resultText,
          { fontWeight: "bold", marginBottom: 15, textAlign: "center" },
        ]}
      >
        Error (m) vs {paramName}
      </Text>
      <View
        style={{
          height: graphHeight,
          width: graphWidth,
          borderLeftWidth: 1,
          borderBottomWidth: 1,
          borderColor: "#ccc",
        }}
      >
        {/* Gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <View
            key={`grid-y-${t}`}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: getY(t * maxY),
              height: 1,
              backgroundColor: "#eee",
              zIndex: -1,
            }}
          />
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <View
            key={`grid-x-${t}`}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: getX(minX + t * (maxX - minX)),
              width: 1,
              backgroundColor: "#eee",
              zIndex: -1,
            }}
          />
        ))}

        {/* Y-axis labels */}
        <Text
          style={{
            position: "absolute",
            left: -35,
            top: 0,
            fontSize: 10,
            color: "#666",
          }}
        >
          {maxY.toFixed(1)}
        </Text>
        <Text
          style={{
            position: "absolute",
            left: -35,
            bottom: 0,
            fontSize: 10,
            color: "#666",
          }}
        >
          0
        </Text>

        {/* X-axis labels */}
        <Text
          style={{
            position: "absolute",
            left: 0,
            bottom: -20,
            fontSize: 10,
            color: "#666",
          }}
        >
          {minX.toFixed(1)}
        </Text>
        <Text
          style={{
            position: "absolute",
            right: 0,
            bottom: -20,
            fontSize: 10,
            color: "#666",
          }}
        >
          {maxX.toFixed(1)}
        </Text>

        {/* Data Line */}
        {data.length > 1 && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {data.map((d, i) => {
              if (i === 0) return null;
              const prev = data[i - 1];
              const x1 = getX(prev.val);
              const y1 = getY(prev.avgError);
              const x2 = getX(d.val);
              const y2 = getY(d.avgError);
              const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
              const angle = Math.atan2(y2 - y1, x2 - x1);

              return (
                <View
                  key={`line-${i}`}
                  style={{
                    position: "absolute",
                    left: x1,
                    top: y1,
                    width: length,
                    height: 2,
                    backgroundColor: ACCENT_COLOR,
                    transform: [
                      { translateX: 0 },
                      { translateY: 0 },
                      { rotate: `${angle}rad` },
                    ],
                    transformOrigin: "left center",
                  }}
                />
              );
            })}
          </View>
        )}

        {/* Data Points & Error Bars */}
        {data.map((d, i) => {
          const x = getX(d.val);
          const y = getY(d.avgError);
          const isSelected = selectedIndex === i;

          return (
            <React.Fragment key={`point-group-${i}`}>
              {/* Error Bar */}
              {d.stdDev > 0 && (
                <View
                  style={{
                    position: "absolute",
                    left: x,
                    top: getY(d.avgError + d.stdDev),
                    width: 1,
                    height:
                      getY(d.avgError - d.stdDev) - getY(d.avgError + d.stdDev),
                    backgroundColor: "#999",
                    zIndex: 1,
                  }}
                >
                  {/* Caps */}
                  <View
                    style={{
                      position: "absolute",
                      top: 0,
                      left: -3,
                      width: 7,
                      height: 1,
                      backgroundColor: "#999",
                    }}
                  />
                  <View
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: -3,
                      width: 7,
                      height: 1,
                      backgroundColor: "#999",
                    }}
                  />
                </View>
              )}

              {/* Point */}
              <TouchableOpacity
                onPress={() => onSelectPoint?.(i)}
                style={{
                  position: "absolute",
                  left: x - 5,
                  top: y - 5,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: isSelected ? "#FF5722" : ACCENT_COLOR,
                  borderWidth: isSelected ? 2 : 1,
                  borderColor: "#fff",
                  zIndex: 5,
                }}
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              />
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
};

const Visualization = ({
  width,
  length,
  result,
  currentAnchors,
  currentTruePos,
  onUpdateTruePos,
  onUpdateAnchor,
  isRandomTruePos,
  onDragStart,
  onDragEnd,
  isRunning,
  showHeatmap,
  onToggleHeatmap,
  isSetup,
  hideControls = false,
  useWhiteBackground = false,
}: {
  width: number;
  length: number;
  result: RunResult | null;
  currentAnchors: AnchorGeometry[];
  currentTruePos: { x: number; y: number };
  onUpdateTruePos: (x: number, y: number) => void;
  onUpdateAnchor: (index: number, x: number, y: number) => void;
  isRandomTruePos: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  isRunning: boolean;
  showHeatmap: boolean;
  onToggleHeatmap: () => void;
  isSetup: boolean;
  hideControls?: boolean;
  useWhiteBackground?: boolean;
}) => {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [showPopulation, setShowPopulation] = useState(true);

  const onLayout = (e: LayoutChangeEvent) => {
    setLayout(e.nativeEvent.layout);
  };

  const scale = layout.width > 0 ? layout.width / width : 0;
  const viewHeight = length * scale;

  // Use result data if available, otherwise fallback to current config
  const anchors = result?.anchors || currentAnchors;
  const truePos = result?.truePos || currentTruePos;
  const estPos = result?.estPos;
  const initialPopulation = result?.initialPopulation;
  const finalPopulation = result?.finalPopulation;

  return (
    <View style={useWhiteBackground && { backgroundColor: "#fff" }}>
      {isSetup && !hideControls && (
        <Text
          style={{
            fontSize: 12,
            color: "#666",
            marginBottom: 8,
            textAlign: "center",
          }}
        >
          Drag the markers to configure the field.
        </Text>
      )}
      {!hideControls && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            alignItems: "center",
            minHeight: 20,
            zIndex: 100,
          }}
        >
          {!isSetup && !isRunning && (
            <>
              {result && (
                <TouchableOpacity
                  onPress={onToggleHeatmap}
                  style={{
                    marginRight: 15,
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text
                    style={{
                      color: ACCENT_COLOR,
                      fontWeight: "600",
                      fontSize: 12,
                    }}
                  >
                    {showHeatmap ? "Hide Heatmap" : "Show Heatmap"}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => setShowPopulation(!showPopulation)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text
                  style={{
                    color: ACCENT_COLOR,
                    fontWeight: "600",
                    fontSize: 12,
                  }}
                >
                  {showPopulation ? "Hide Population" : "Show Population"}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
      <View
        style={[
          styles.field,
          { height: viewHeight || 200, marginVertical: 15 },
          useWhiteBackground && { backgroundColor: "#fff" },
        ]}
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

        {/* Heatmap */}
        {showHeatmap && result && scale > 0 && (
          <HeatmapOverlay
            width={width}
            length={length}
            scale={scale}
            result={result}
          />
        )}

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
            isEditable={!isRunning && !result} // Only editable if not viewing a result
            style={{ zIndex: 10 }}
          />
        ))}

        {/* True Position */}
        {(!isRandomTruePos || result) && (
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
            isEditable={!isRunning && !result && !isRandomTruePos}
            style={{
              borderColor: "#fff",
              borderWidth: 2,
              zIndex: 20,
            }}
          />
        )}

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
        {(!isRandomTruePos || result) && (
          <View style={styles.legendItem}>
            <View
              style={[styles.legendMarkerBase, { backgroundColor: "#2e7d32" }]}
            />
            <Text style={styles.legendText}>True Position</Text>
          </View>
        )}
        {result && (
          <>
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendMarkerBase,
                  { backgroundColor: "#d32f2f" },
                ]}
              />
              <Text style={styles.legendText}>Estimated Position</Text>
            </View>
            {showPopulation && (
              <>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendMarkerBase,
                      {
                        backgroundColor: "rgba(100, 100, 100, 0.3)",
                        borderWidth: 0,
                      },
                    ]}
                  />
                  <Text style={styles.legendText}>Initial Population</Text>
                </View>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendMarkerBase,
                      {
                        backgroundColor: "rgba(255, 165, 0, 0.6)",
                        borderWidth: 0,
                      },
                    ]}
                  />
                  <Text style={styles.legendText}>Final Population</Text>
                </View>
              </>
            )}
          </>
        )}
        {showHeatmap && result && (
          <View
            style={[
              styles.legendItem,
              { width: "100%", justifyContent: "center", marginTop: 10 },
            ]}
          >
            <Text style={[styles.legendText, { marginRight: 8 }]}>
              Low Error
            </Text>
            <View
              style={{
                flexDirection: "row",
                height: 12,
                width: 120,
                borderRadius: 6,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: "#ddd",
              }}
            >
              <View style={{ flex: 1, backgroundColor: "rgb(128, 0, 128)" }} />
              <View style={{ flex: 1, backgroundColor: "rgb(160, 64, 96)" }} />
              <View style={{ flex: 1, backgroundColor: "rgb(192, 128, 64)" }} />
              <View style={{ flex: 1, backgroundColor: "rgb(224, 192, 32)" }} />
              <View style={{ flex: 1, backgroundColor: "rgb(255, 255, 0)" }} />
            </View>
            <Text style={[styles.legendText, { marginLeft: 8 }]}>
              High Error
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};
export default function OptimizationTestScreen() {
  // Configuration State
  const [inputWidth, setInputWidth] = useState(
    DEFAULT_FIELD_DIMENSIONS.widthMeters.toString(),
  );
  const [inputLength, setInputLength] = useState(
    DEFAULT_FIELD_DIMENSIONS.lengthMeters.toString(),
  );
  const [fieldWidth, setFieldWidth] = useState(
    DEFAULT_FIELD_DIMENSIONS.widthMeters,
  );
  const [fieldLength, setFieldLength] = useState(
    DEFAULT_FIELD_DIMENSIONS.lengthMeters,
  );
  const [fieldPreset, setFieldPreset] = useState("custom");
  const [numAnchors, setNumAnchors] = useState("8");

  const handlePresetChange = useCallback((presetValue: string) => {
    setFieldPreset(presetValue);
    const preset = FIELD_PRESETS.find((p) => p.value === presetValue);
    if (preset && presetValue !== "custom") {
      setInputWidth(preset.width.toString());
      setInputLength(preset.length.toString());
      setFieldWidth(preset.width);
      setFieldLength(preset.length);
    }
  }, []);

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

  const [iterationTimeLimit, setIterationTimeLimit] = useState(
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

  // Simulation Noise State
  const [baseSigma, setBaseSigma] = useState(
    DEFAULT_SIMULATION_NOISE.baseSigma.toString(),
  );
  const [distanceSlope, setDistanceSlope] = useState(
    DEFAULT_SIMULATION_NOISE.distanceSlope.toString(),
  );

  const [selectedModel, setSelectedModel] = useState("TwoRayGround");
  const [selectedAlgorithm, setSelectedAlgorithm] = useState("MFASA");
  const [selectedFilter, setSelectedFilter] = useState("Kalman");

  // True Position State
  const [isRandomTruePos, setIsRandomTruePos] = useState(true);
  const [manualTrueX, setManualTrueX] = useState("25");
  const [manualTrueY, setManualTrueY] = useState("15");
  const [currentTruePos, setCurrentTruePos] = useState({ x: 25, y: 15 });

  // Anchor State
  const [anchorPlacementMode, setAnchorPlacementMode] = useState<
    "random" | "border" | "grid" | "evenly"
  >("border");
  const [currentAnchors, setCurrentAnchors] = useState<AnchorGeometry[]>([]);

  // Test Execution State
  const [testMode, setTestMode] = useState<TestMode>("standard");
  const [numRuns, setNumRuns] = useState("10");
  const [sweepConfig, setSweepConfig] = useState<SweepConfig>({
    param: "populationSize",
    min: "10",
    max: "100",
    step: "10",
    runsPerStep: "5",
  });
  const [sweepResults, setSweepResults] = useState<SweepStepResult[]>([]);
  const [selectedSweepIndex, setSelectedSweepIndex] = useState<number | null>(
    null,
  );

  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logBatches, setLogBatches] = useState<LogBatch[]>([]);
  const isCancelledRef = useRef(false);
  const currentOptimizerRef = useRef<MFASAOptimizer | null>(null);

  // Results State
  const [results, setResults] = useState<RunResult[]>([]);
  const [batchAnalysis, setBatchAnalysis] = useState<BatchAnalysis | null>(
    null,
  );
  const [selectedResultIndex, setSelectedResultIndex] = useState<number>(0);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [useWhiteBackground, setUseWhiteBackground] = useState(true);

  const [viewMode, setViewMode] = useState<"config" | "results">("config");
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const visualizationRef = useRef<View>(null);

  const addLog = (msg: string) => {
    const entry: LogEntry = { timestamp: Date.now(), message: msg };
    setLogBatches((prev) => {
      if (prev.length === 0) return prev;
      const newBatches = [...prev];
      newBatches[0] = {
        ...newBatches[0],
        entries: [entry, ...newBatches[0].entries],
      };
      return newBatches;
    });
  };

  const cancelTest = useCallback(() => {
    isCancelledRef.current = true;
    if (currentOptimizerRef.current) {
      currentOptimizerRef.current.cancel();
    }
    addLog("Cancelling test...");
  }, []);

  const generateAnchors = useCallback(() => {
    const w = fieldWidth;
    const l = fieldLength;
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
      let cols = Math.max(1, Math.round(Math.sqrt(n / ratio)));
      let rows = Math.ceil(n / cols);

      // Adjust to minimize empty cells if possible
      if (cols * (rows - 1) >= n) {
        rows--;
      }

      const stepX = w / cols;
      const stepY = l / rows;

      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;

        // Center the last row if it's not full
        const numInRow = r === rows - 1 ? n % cols || cols : cols;
        const rowOffset = ((cols - numInRow) * stepX) / 2;

        const x = (c + 0.5) * stepX + rowOffset;
        const y = (r + 0.5) * stepY;

        newAnchors.push({
          mac: `00:11:22:33:44:0${i}`,
          x: Math.min(w, Math.max(0, x)),
          y: Math.min(l, Math.max(0, y)),
        });
      }
    } else if (anchorPlacementMode === "evenly") {
      // Evenly spaced grid including boundaries
      const ratio = l / w;
      let cols = Math.max(2, Math.round(Math.sqrt(n / ratio)));
      let rows = Math.ceil(n / cols);

      // Adjust to fit n better
      if (cols * (rows - 1) >= n && rows > 2) {
        rows--;
      }

      const stepX = cols > 1 ? w / (cols - 1) : 0;
      const stepY = rows > 1 ? l / (rows - 1) : 0;

      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;

        // If we have a "hole" in the middle (like 8 anchors in 3x3),
        // we can skip the center point to keep it symmetric
        let finalC = c;
        let finalR = r;

        // Special case for 8 in 3x3 to skip center
        if (n === 8 && cols === 3 && rows === 3 && i >= 4) {
          const adjustedIdx = i + 1;
          finalR = Math.floor(adjustedIdx / cols);
          finalC = adjustedIdx % cols;
        }

        const x = finalC * stepX;
        const y = finalR * stepY;

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

  // Initial generation only if empty
  useEffect(() => {
    if (currentAnchors.length === 0) {
      generateAnchors();
    }
  }, [generateAnchors, currentAnchors.length]);

  const performSimulation = useCallback(
    async (runId: number, paramOverrides: any = {}): Promise<RunResult> => {
      // Parse Config (Base)
      const width = fieldWidth;
      const length = fieldLength;

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

      // Merge base params with overrides
      const params = {
        iterationTimeLimitMs:
          parseFloat(iterationTimeLimit) || DEFAULT_MFASA_OPTIONS.timeBudgetMs,
        maxIterations:
          parseInt(maxIterations) || DEFAULT_MFASA_OPTIONS.maxIterations,
        populationSize:
          parseInt(populationSize) || DEFAULT_MFASA_OPTIONS.populationSize,
        beta0: parseFloat(beta0) || DEFAULT_MFASA_OPTIONS.beta0,
        lightAbsorption:
          parseFloat(lightAbsorption) || DEFAULT_MFASA_OPTIONS.lightAbsorption,
        alpha: parseFloat(alpha) || DEFAULT_MFASA_OPTIONS.alpha,
        initialTemperature:
          parseFloat(initialTemperature) ||
          DEFAULT_MFASA_OPTIONS.initialTemperature,
        coolingRate:
          parseFloat(coolingRate) || DEFAULT_MFASA_OPTIONS.coolingRate,
        ...paramOverrides,
      };

      // 1. Setup Model
      let model;
      if (selectedModel === "TwoRayGround") {
        model = new TwoRayGroundModel();
      } else {
        model = new LogNormalModel();
      }

      // 2. Setup Optimizer
      const optimizer = new MFASAOptimizer({
        timeBudgetMs: 10, // Fixed per-slice budget for UI responsiveness
        iterationTimeLimitMs: params.iterationTimeLimitMs,
        maxIterations: params.maxIterations,
        populationSize: params.populationSize,
        beta0: params.beta0,
        lightAbsorption: params.lightAbsorption,
        alpha: params.alpha,
        initialTemperature: params.initialTemperature,
        coolingRate: params.coolingRate,
      });
      currentOptimizerRef.current = optimizer;

      // 3. Generate Scenario
      let trueX, trueY;
      if (isRandomTruePos) {
        trueX = Math.random() * width;
        trueY = Math.random() * length;
      } else {
        trueX = parseFloat(manualTrueX) || width / 2;
        trueY = parseFloat(manualTrueY) || length / 2;
      }

      const candidates: BeaconMeasurement[] = [];
      const SAMPLE_COUNT = 20;

      // Use currentAnchors state
      currentAnchors.forEach((anchor) => {
        const dist = Math.sqrt(
          (trueX - anchor.x) ** 2 + (trueY - anchor.y) ** 2,
        );
        const txPower = DEFAULT_TX_POWER_DBM;
        const trueRssi = model.estimateRssi({
          distanceMeters: dist,
          txPowerDbm: txPower,
          constants: constants,
        });

        // Scientifically realistic noise: standard deviation increases with distance.
        const bSigma = parseFloat(baseSigma) || 0;
        const dSlope = parseFloat(distanceSlope) || 0;
        const sigma = bSigma + dSlope * dist;

        const kf = new KalmanFilter({
          processNoise: DEFAULT_KALMAN_CONFIG.processNoise,
          measurementNoise: sigma ** 2,
        });

        let filteredRssi = trueRssi;
        for (let i = 0; i < SAMPLE_COUNT; i++) {
          const u1 = Math.random();
          const u2 = Math.random();
          const z =
            Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
          const noise = z * sigma;
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

      // 4. Run Optimizer
      const startTime = performance.now();
      const result = await optimizer.solve({
        candidate: candidates,
        anchors: currentAnchors,
        propagation: model,
        constants: constants,
        bounds: bounds,
        iterationTimeLimitMs: params.iterationTimeLimitMs,
      });
      const endTime = performance.now();
      const duration = endTime - startTime;

      const errorDist = Math.sqrt(
        (result.x - trueX) ** 2 + (result.y - trueY) ** 2,
      );

      return {
        id: runId,
        params,
        truePos: { x: trueX, y: trueY },
        estPos: { x: result.x, y: result.y },
        error: errorDist,
        rssiRmse: result.errorRmse,
        duration,
        iterations: result.iterations,
        initialPopulation: result.diagnostics?.initialPopulation,
        finalPopulation: result.diagnostics?.finalPopulation,
        anchors: [...currentAnchors], // Snapshot
        measurements: candidates,
        modelType: selectedModel,
        constants,
        diagnostics: result.diagnostics,
      };
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
      iterationTimeLimit,
      maxIterations,
      populationSize,
      beta0,
      lightAbsorption,
      alpha,
      initialTemperature,
      coolingRate,
      selectedModel,
      isRandomTruePos,
      manualTrueX,
      manualTrueY,
      currentAnchors,
      baseSigma,
      distanceSlope,
    ],
  );

  const runOptimizationTest = useCallback(async () => {
    setIsRunning(true);
    isCancelledRef.current = false;

    const newBatch: LogBatch = {
      id: Date.now(),
      startTime: Date.now(),
      entries: [],
      type: testMode === "standard" ? "Standard" : "Sweep",
    };
    setLogBatches((prev) => [newBatch, ...prev]);

    setResults([]);
    setProgress(0);
    setViewMode("results");

    const settingsLog = `Test Configuration:
Mode: ${testMode}
Runs: ${numRuns}
Field: ${fieldWidth}m x ${fieldLength}m
Anchors: ${numAnchors} (${anchorPlacementMode})
Model: ${selectedModel}
Algorithm: ${selectedAlgorithm}
Filter: ${selectedFilter}

Propagation Constants:
Tx Height: ${txHeight}m
Rx Height: ${rxHeight}m
Frequency: ${freq}Hz
Tx Gain: ${txGain}
Rx Gain: ${rxGain}
Reflection Coeff: ${refCoeff}

MFASA Options:
Time Limit: ${iterationTimeLimit}ms
Max Iterations: ${maxIterations}
Population: ${populationSize}
Beta0: ${beta0}
Light Absorption: ${lightAbsorption}
Alpha: ${alpha}
Initial Temp: ${initialTemperature}
Cooling Rate: ${coolingRate}

Simulation Noise:
Base Sigma: ${baseSigma}
Distance Slope: ${distanceSlope}

True Position: ${isRandomTruePos ? "Random" : `Fixed (${manualTrueX}, ${manualTrueY})`}`;

    addLog(settingsLog);
    addLog(
      `Starting ${testMode === "standard" ? "Standard" : "Sweep"} Test...`,
    );

    try {
      const newResults: RunResult[] = [];
      const newSweepResults: SweepStepResult[] = [];

      if (testMode === "standard") {
        const n = parseInt(numRuns) || 10;
        for (let i = 0; i < n; i++) {
          if (isCancelledRef.current) break;
          await new Promise((resolve) => setTimeout(resolve, 0)); // Yield
          const res = await performSimulation(i + 1);
          newResults.push(res);

          const runLog = `Run ${i + 1}:
Error: ${res.error.toFixed(2)}m
RSSI RMSE: ${res.rssiRmse.toFixed(2)}
Time: ${res.duration.toFixed(2)}ms
Iterations: ${res.iterations}
Est Pos: (${res.estPos.x.toFixed(2)}, ${res.estPos.y.toFixed(2)})
${isRandomTruePos ? `True Pos: (${res.truePos.x.toFixed(2)}, ${res.truePos.y.toFixed(2)})` : ""}`;

          addLog(runLog);
          setProgress((i + 1) / n);
        }
      } else {
        // Sweep Mode
        const min = parseFloat(sweepConfig.min);
        const max = parseFloat(sweepConfig.max);
        const step = parseFloat(sweepConfig.step);
        const runsPerStep = parseInt(sweepConfig.runsPerStep) || 1;
        const paramName = sweepConfig.param;

        if (isNaN(min) || isNaN(max) || isNaN(step) || step <= 0) {
          throw new Error("Invalid sweep configuration");
        }

        let val = min;
        let stepIdx = 0;
        const steps = Math.floor((max - min) / step) + 1;
        const totalRuns = steps * runsPerStep;

        while (val <= max + 0.00001) {
          if (isCancelledRef.current) break;

          const stepRuns: RunResult[] = [];
          for (let r = 0; r < runsPerStep; r++) {
            if (isCancelledRef.current) break;
            await new Promise((resolve) => setTimeout(resolve, 0)); // Yield
            const overrides = { [paramName]: val };
            const res = await performSimulation(
              stepIdx * runsPerStep + r + 1,
              overrides,
            );
            stepRuns.push(res);
            newResults.push(res);
            addLog(
              `Step ${stepIdx + 1}, Run ${r + 1} (${paramName}=${val.toFixed(2)}):
Error: ${res.error.toFixed(2)}m
RSSI RMSE: ${res.rssiRmse.toFixed(2)}
Iterations: ${res.iterations}`,
            );
            setProgress((stepIdx * runsPerStep + r + 1) / totalRuns);
          }

          const avgError =
            stepRuns.reduce((acc, curr) => acc + curr.error, 0) /
            stepRuns.length;
          const avgIterations =
            stepRuns.reduce((acc, curr) => acc + curr.iterations, 0) /
            stepRuns.length;
          const stdDev =
            stepRuns.length > 1
              ? Math.sqrt(
                  stepRuns.reduce(
                    (acc, curr) => acc + Math.pow(curr.error - avgError, 2),
                    0,
                  ) / stepRuns.length,
                )
              : 0;

          newSweepResults.push({
            val,
            avgError,
            stdDev,
            avgIterations,
            runs: stepRuns,
          });

          val += step;
          stepIdx++;
        }
      }

      if (isCancelledRef.current) {
        addLog("Test cancelled by user.");
      }

      setResults(newResults);
      setSweepResults(newSweepResults);
      setSelectedResultIndex(0);
      setSelectedSweepIndex(null);

      // Summary Stats & Analysis
      const errors = newResults.map((r) => r.error);
      const durations = newResults.map((r) => r.duration);
      const iterations = newResults.map((r) => r.iterations);
      const n = errors.length;

      if (n === 0) {
        setBatchAnalysis(null);
        return;
      }

      const avgError = errors.reduce((a, b) => a + b, 0) / n;
      const avgDuration = durations.reduce((a, b) => a + b, 0) / n;
      const avgIterations = iterations.reduce((a, b) => a + b, 0) / n;
      const minError = Math.min(...errors);
      const maxError = Math.max(...errors);

      // RMSE
      const rmse = Math.sqrt(
        errors.reduce((acc, val) => acc + val * val, 0) / n,
      );

      // Avg RSSI RMSE
      const avgRssiRmse =
        newResults.reduce((acc, r) => acc + r.rssiRmse, 0) / n;

      // Standard Deviation
      const stdDev = Math.sqrt(
        errors.reduce((acc, val) => acc + Math.pow(val - avgError, 2), 0) / n,
      );

      // Median
      const sortedErrors = [...errors].sort((a, b) => a - b);
      const medianError =
        n % 2 === 0
          ? (sortedErrors[n / 2 - 1] + sortedErrors[n / 2]) / 2
          : sortedErrors[Math.floor(n / 2)];

      // Success Rates
      const successRate1m = (errors.filter((e) => e < 1).length / n) * 100;
      const successRate2m = (errors.filter((e) => e < 2).length / n) * 100;

      // Best Runs
      const bestRuns = [...newResults]
        .sort((a, b) => a.error - b.error)
        .slice(0, 5);

      const analysis: BatchAnalysis = {
        avgError,
        stdDev,
        rmse,
        avgRssiRmse,
        medianError,
        minError,
        maxError,
        avgDuration,
        avgIterations,
        successRate1m,
        successRate2m,
        totalRuns: n,
        bestRuns,
      };

      setBatchAnalysis(analysis);

      addLog(`Batch Analysis:
Avg Error: ${avgError.toFixed(3)}m
Position RMSE: ${rmse.toFixed(3)}m
Avg RSSI RMSE: ${avgRssiRmse.toFixed(3)}
Std Dev: ${stdDev.toFixed(3)}m
Median: ${medianError.toFixed(3)}m
Avg Iterations: ${avgIterations.toFixed(1)}
Min/Max: ${minError.toFixed(3)}m / ${maxError.toFixed(3)}m
Avg Time: ${avgDuration.toFixed(2)}ms
Success <1m: ${successRate1m.toFixed(1)}%
Success <2m: ${successRate2m.toFixed(1)}%`);
    } catch (e: any) {
      if (e.message !== "Cancelled") {
        addLog(`Error: ${e.message}`);
        console.error(e);
      }
    } finally {
      setIsRunning(false);
    }
  }, [
    testMode,
    numRuns,
    sweepConfig,
    performSimulation,
    fieldWidth,
    fieldLength,
    numAnchors,
    anchorPlacementMode,
    selectedModel,
    selectedAlgorithm,
    selectedFilter,
    txHeight,
    rxHeight,
    freq,
    txGain,
    rxGain,
    refCoeff,
    iterationTimeLimit,
    maxIterations,
    populationSize,
    beta0,
    lightAbsorption,
    alpha,
    initialTemperature,
    coolingRate,
    baseSigma,
    distanceSlope,
    isRandomTruePos,
    manualTrueX,
    manualTrueY,
  ]);

  const selectedResult = results[selectedResultIndex] || null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollContainer}
        scrollEnabled={scrollEnabled}
        nestedScrollEnabled={true}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={[
              styles.backButton,
              { opacity: viewMode === "results" && !isRunning ? 1 : 0 },
            ]}
            onPress={() => {
              if (viewMode === "results") {
                setViewMode("config");
                setResults([]);
              }
            }}
            disabled={viewMode !== "results" || isRunning}
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Optimization Test</Text>
        </View>

        <View style={styles.section}>
          <View
            style={[
              styles.sectionHeader,
              { flexWrap: "wrap", paddingVertical: 8 },
            ]}
          >
            <Text
              style={[
                styles.sectionTitle,
                { marginRight: 10, flexShrink: 1, minWidth: 120 },
              ]}
              numberOfLines={1}
            >
              Visualization
            </Text>
            {!isRunning && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flexShrink: 0,
                  marginVertical: 4,
                }}
              >
                <TouchableOpacity
                  onPress={() => setUseWhiteBackground(!useWhiteBackground)}
                  style={{
                    marginRight: 15,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <View
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      borderWidth: 1,
                      borderColor: ACCENT_COLOR,
                      backgroundColor: useWhiteBackground
                        ? ACCENT_COLOR
                        : "transparent",
                      marginRight: 6,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {useWhiteBackground && (
                      <Text style={{ color: "#fff", fontSize: 10 }}>✓</Text>
                    )}
                  </View>
                  <Text
                    style={{
                      fontSize: 12,
                      color: useWhiteBackground ? ACCENT_COLOR : "#666",
                      fontWeight: useWhiteBackground ? "600" : "400",
                    }}
                  >
                    White BG
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 4,
                    backgroundColor: ACCENT_COLOR,
                  }}
                  onPress={async () => {
                    try {
                      setIsCapturing(true);
                      await new Promise((resolve) => setTimeout(resolve, 100));
                      const base64 = await captureRef(visualizationRef, {
                        format: "png",
                        quality: 0.8,
                        result: "base64",
                      });
                      await Clipboard.setImageAsync(base64);
                      Alert.alert("Success", "Image copied to clipboard");
                    } catch (e) {
                      console.error(e);
                      Alert.alert("Error", "Failed to copy image");
                    } finally {
                      setIsCapturing(false);
                    }
                  }}
                >
                  <Text
                    style={{ color: "#fff", fontSize: 12, fontWeight: "bold" }}
                  >
                    Copy Image
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          <View
            style={[
              styles.sectionContent,
              useWhiteBackground && { backgroundColor: "#fff" },
            ]}
            ref={visualizationRef}
            collapsable={false}
          >
            <Visualization
              width={fieldWidth}
              length={fieldLength}
              result={selectedResult}
              currentAnchors={currentAnchors}
              currentTruePos={currentTruePos}
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
              isRandomTruePos={isRandomTruePos}
              isRunning={isRunning}
              showHeatmap={showHeatmap}
              onToggleHeatmap={() => setShowHeatmap(!showHeatmap)}
              isSetup={viewMode === "config"}
              hideControls={isCapturing}
              useWhiteBackground={useWhiteBackground}
            />
            {isRunning && (
              <View style={{ marginTop: 20 }}>
                <View style={styles.progressBarContainer}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${progress * 100}%` },
                    ]}
                  />
                </View>
                <TouchableOpacity
                  onPress={cancelTest}
                  style={{
                    marginTop: 10,
                    backgroundColor: "#d32f2f",
                    padding: 8,
                    borderRadius: 6,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      { fontSize: 12, fontWeight: "bold" },
                    ]}
                  >
                    CANCEL RUN
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {viewMode === "config" ? (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Test Configuration & Control
                </Text>
              </View>
              <View style={styles.sectionContent}>
                <Dropdown
                  label="Test Mode"
                  value={testMode}
                  options={[
                    { label: "Standard", value: "standard" },
                    { label: "Parameter Sweep", value: "sweep" },
                  ]}
                  onSelect={(v) => setTestMode(v as TestMode)}
                  disabled={isRunning}
                  onToggle={(open) => setScrollEnabled(!open)}
                />

                {testMode === "standard" ? (
                  <InputRow
                    label="Number of Runs"
                    value={numRuns}
                    onChange={setNumRuns}
                    disabled={isRunning}
                  />
                ) : (
                  <>
                    <Dropdown
                      label="Sweep Parameter"
                      value={sweepConfig.param}
                      options={[
                        {
                          label: "Iteration Time Limit",
                          value: "iterationTimeLimitMs",
                        },
                        { label: "Max Iterations", value: "maxIterations" },
                        { label: "Population Size", value: "populationSize" },
                        { label: "Beta0", value: "beta0" },
                        { label: "Light Absorption", value: "lightAbsorption" },
                        { label: "Alpha", value: "alpha" },
                        { label: "Initial Temp", value: "initialTemperature" },
                        { label: "Cooling Rate", value: "coolingRate" },
                      ]}
                      onSelect={(v) =>
                        setSweepConfig((prev) => ({ ...prev, param: v }))
                      }
                      disabled={isRunning}
                      onToggle={(open) => setScrollEnabled(!open)}
                    />
                    <InputRow
                      label="Min Value"
                      value={sweepConfig.min}
                      onChange={(v) =>
                        setSweepConfig((prev) => ({ ...prev, min: v }))
                      }
                      disabled={isRunning}
                    />
                    <InputRow
                      label="Max Value"
                      value={sweepConfig.max}
                      onChange={(v) =>
                        setSweepConfig((prev) => ({ ...prev, max: v }))
                      }
                      disabled={isRunning}
                    />
                    <InputRow
                      label="Step Size"
                      value={sweepConfig.step}
                      onChange={(v) =>
                        setSweepConfig((prev) => ({ ...prev, step: v }))
                      }
                      disabled={isRunning}
                    />
                    <InputRow
                      label="Runs per Step"
                      value={sweepConfig.runsPerStep}
                      onChange={(v) =>
                        setSweepConfig((prev) => ({ ...prev, runsPerStep: v }))
                      }
                      disabled={isRunning}
                    />
                  </>
                )}

                <InputRow
                  label="Iteration Time Limit (ms)"
                  value={iterationTimeLimit}
                  onChange={setIterationTimeLimit}
                  tooltip="Maximum time allowed for the optimization process."
                  disabled={isRunning}
                />
                <InputRow
                  label="Max Iterations"
                  value={maxIterations}
                  onChange={setMaxIterations}
                  tooltip="Maximum number of optimization steps."
                  disabled={isRunning}
                />

                <View
                  style={[styles.controls, { marginTop: 10, marginBottom: 0 }]}
                >
                  {isRunning ? (
                    <View
                      style={[
                        styles.button,
                        styles.buttonDisabled,
                        {
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                        },
                      ]}
                    >
                      <View
                        style={{ flexDirection: "row", alignItems: "center" }}
                      >
                        <ActivityIndicator
                          color="#fff"
                          style={{ marginRight: 10 }}
                        />
                        <Text style={styles.buttonText}>
                          {(progress * 100).toFixed(0)}%
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={cancelTest}
                        style={{
                          backgroundColor: "rgba(255,255,255,0.2)",
                          paddingHorizontal: 12,
                          paddingVertical: 4,
                          borderRadius: 4,
                        }}
                      >
                        <Text
                          style={[
                            styles.buttonText,
                            { fontSize: 12, fontWeight: "bold" },
                          ]}
                        >
                          CANCEL
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.button}
                      onPress={runOptimizationTest}
                    >
                      <Text style={styles.buttonText}>
                        Run Optimization Test
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>

            <CollapsibleSection title="Model & Filter">
              <Dropdown
                label="Propagation Model"
                value={selectedModel}
                options={[
                  { label: "Log Normal", value: "LogNormal" },
                  { label: "Two Ray Ground", value: "TwoRayGround" },
                ]}
                onSelect={setSelectedModel}
                disabled={isRunning}
                onToggle={(open) => setScrollEnabled(!open)}
              />
              <Dropdown
                label="RSSI Filter"
                value={selectedFilter}
                options={[{ label: "Kalman", value: "Kalman" }]}
                onSelect={setSelectedFilter}
                disabled={isRunning}
                onToggle={(open) => setScrollEnabled(!open)}
              />
            </CollapsibleSection>

            <CollapsibleSection title="Algorithm">
              <Dropdown
                label="Algorithm"
                value={selectedAlgorithm}
                options={[{ label: "MFASA", value: "MFASA" }]}
                onSelect={setSelectedAlgorithm}
                disabled={isRunning}
                onToggle={(open) => setScrollEnabled(!open)}
              />
              <InputRow
                label="Population Size"
                value={populationSize}
                onChange={setPopulationSize}
                tooltip="Number of candidate positions ('fireflies') in the swarm. Larger population explores better but is slower."
                disabled={isRunning}
              />
              <InputRow
                label="Beta0"
                value={beta0}
                onChange={setBeta0}
                tooltip="Attractiveness at distance 0. Controls how strongly fireflies are attracted to brighter ones."
                disabled={isRunning}
              />
              <InputRow
                label="Light Absorption"
                value={lightAbsorption}
                onChange={setLightAbsorption}
                tooltip="Controls how quickly attractiveness decreases with distance. High values mean local search, low values mean global search."
                disabled={isRunning}
              />
              <InputRow
                label="Alpha"
                value={alpha}
                onChange={setAlpha}
                tooltip="Randomization parameter. Controls the randomness of movement."
                disabled={isRunning}
              />
              <InputRow
                label="Initial Temperature"
                value={initialTemperature}
                onChange={setInitialTemperature}
                tooltip="Starting temperature for Simulated Annealing. Higher means more random movement initially."
                disabled={isRunning}
              />
              <InputRow
                label="Cooling Rate"
                value={coolingRate}
                onChange={setCoolingRate}
                tooltip="How fast the temperature decreases (0-1). Closer to 1 means slower cooling."
                disabled={isRunning}
              />
            </CollapsibleSection>

            <CollapsibleSection title="Simulation Noise">
              <InputRow
                label="Base Sigma (dBm)"
                value={baseSigma}
                onChange={setBaseSigma}
                tooltip="The standard deviation of RSSI noise at 0 meters distance."
                disabled={isRunning}
              />
              <InputRow
                label="Distance Slope (dBm/m)"
                value={distanceSlope}
                onChange={setDistanceSlope}
                tooltip="How much the standard deviation increases per meter of distance."
                disabled={isRunning}
              />
            </CollapsibleSection>

            <CollapsibleSection title="True Position">
              <TouchableOpacity
                style={[styles.checkboxRow, isRunning && { opacity: 0.5 }]}
                onPress={() =>
                  !isRunning && setIsRandomTruePos(!isRandomTruePos)
                }
                disabled={isRunning}
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
                <Text style={styles.labelText}>
                  Randomly Select True Position
                </Text>
              </TouchableOpacity>

              {!isRandomTruePos && (
                <>
                  <InputRow
                    label="True X (m)"
                    value={manualTrueX}
                    onChange={(v) => {
                      setManualTrueX(v);
                      setCurrentTruePos((p) => ({
                        ...p,
                        x: parseFloat(v) || 0,
                      }));
                    }}
                    disabled={isRunning}
                  />
                  <InputRow
                    label="True Y (m)"
                    value={manualTrueY}
                    onChange={(v) => {
                      setManualTrueY(v);
                      setCurrentTruePos((p) => ({
                        ...p,
                        y: parseFloat(v) || 0,
                      }));
                    }}
                    disabled={isRunning}
                  />
                </>
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Field & Anchors">
              <Dropdown
                label="Field Preset"
                value={fieldPreset}
                options={FIELD_PRESETS.map((p) => ({
                  label: p.label,
                  value: p.value,
                }))}
                onSelect={handlePresetChange}
                disabled={isRunning}
              />
              {fieldPreset === "custom" && (
                <>
                  <InputRow
                    label="Width (m)"
                    value={inputWidth}
                    onChange={setInputWidth}
                    disabled={isRunning}
                  />
                  <InputRow
                    label="Length (m)"
                    value={inputLength}
                    onChange={setInputLength}
                    disabled={isRunning}
                  />
                  <TouchableOpacity
                    style={[
                      styles.button,
                      {
                        backgroundColor: ACCENT_COLOR,
                        marginTop: 5,
                        marginBottom: 15,
                      },
                      isRunning && styles.buttonDisabled,
                    ]}
                    onPress={() => {
                      setFieldWidth(parseFloat(inputWidth) || 100);
                      setFieldLength(parseFloat(inputLength) || 100);
                    }}
                    disabled={isRunning}
                  >
                    <Text style={styles.buttonText}>Resize Field</Text>
                  </TouchableOpacity>
                </>
              )}

              <InputRow
                label="Number of Anchors"
                value={numAnchors}
                onChange={setNumAnchors}
                disabled={isRunning}
              />
              <Dropdown
                label="Anchor Placement"
                value={anchorPlacementMode}
                options={[
                  { label: "Border", value: "border" },
                  { label: "Grid", value: "grid" },
                  { label: "Evenly Spaced", value: "evenly" },
                  { label: "Random", value: "random" },
                ]}
                onSelect={(v) => setAnchorPlacementMode(v as any)}
                disabled={isRunning}
                onToggle={(open) => setScrollEnabled(!open)}
              />

              <TouchableOpacity
                style={[
                  styles.button,
                  { backgroundColor: ACCENT_COLOR, marginTop: 10 },
                  isRunning && styles.buttonDisabled,
                ]}
                onPress={generateAnchors}
                disabled={isRunning}
              >
                <Text style={styles.buttonText}>Generate Anchors</Text>
              </TouchableOpacity>
            </CollapsibleSection>

            <CollapsibleSection
              title="Propagation Constants"
              defaultOpen={false}
            >
              <InputRow
                label="Transmitter Height (m)"
                value={txHeight}
                onChange={setTxHeight}
                tooltip="Height of the beacon from the ground. Affects ground reflection path."
                disabled={isRunning}
              />
              <InputRow
                label="Receiver Height (m)"
                value={rxHeight}
                onChange={setRxHeight}
                tooltip="Height of the phone from the ground. Affects ground reflection path."
                disabled={isRunning}
              />
              <InputRow
                label="Frequency (Hz)"
                value={freq}
                onChange={setFreq}
                tooltip="Signal frequency (usually 2.4GHz for BLE). Affects wavelength and path loss."
                disabled={isRunning}
              />
              <InputRow
                label="Transmitter Gain"
                value={txGain}
                onChange={setTxGain}
                tooltip="Antenna gain of the beacon (linear scale)."
                disabled={isRunning}
              />
              <InputRow
                label="Receiver Gain"
                value={rxGain}
                onChange={setRxGain}
                tooltip="Antenna gain of the phone (linear scale)."
                disabled={isRunning}
              />
              <InputRow
                label="Reflection Coefficient"
                value={refCoeff}
                onChange={setRefCoeff}
                tooltip="How much signal is reflected by the ground (0-1). 1 means perfect reflection."
                disabled={isRunning}
              />
            </CollapsibleSection>
          </>
        ) : null}

        {viewMode === "results" && results.length > 0 && (
          <>
            {batchAnalysis && (
              <CollapsibleSection title="Batch Analysis">
                <View style={styles.logBatchContainer}>
                  <View style={styles.logBatchHeader}>
                    <View>
                      <Text style={styles.logBatchTitle}>
                        Summary Statistics
                      </Text>
                      <Text style={styles.logBatchTime}>
                        {batchAnalysis.totalRuns} Runs Total
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.copyButton}
                      onPress={async () => {
                        const text = `Batch Analysis:
Avg Error: ${batchAnalysis.avgError.toFixed(3)}m
Position RMSE: ${batchAnalysis.rmse.toFixed(3)}m
Avg RSSI RMSE: ${batchAnalysis.avgRssiRmse.toFixed(3)}
Std Dev: ${batchAnalysis.stdDev.toFixed(3)}m
Median: ${batchAnalysis.medianError.toFixed(3)}m
Avg Iterations: ${batchAnalysis.avgIterations.toFixed(1)}
Min/Max: ${batchAnalysis.minError.toFixed(3)}m / ${batchAnalysis.maxError.toFixed(3)}m
Avg Time: ${batchAnalysis.avgDuration.toFixed(2)}ms
Success <1m: ${batchAnalysis.successRate1m.toFixed(1)}%
Success <2m: ${batchAnalysis.successRate2m.toFixed(1)}%`;
                        await Clipboard.setStringAsync(text);
                        Alert.alert("Copied", "Analysis copied to clipboard");
                      }}
                    >
                      <Text style={styles.copyButtonText}>Copy</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.logEntries, { maxHeight: undefined }]}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        marginBottom: 10,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.resultText, { fontWeight: "bold" }]}
                        >
                          Accuracy
                        </Text>
                        <Text style={styles.resultText}>
                          Avg Error: {batchAnalysis.avgError.toFixed(3)}m
                        </Text>
                        <Text style={styles.resultText}>
                          RMSE: {batchAnalysis.rmse.toFixed(3)}m
                        </Text>
                        <Text style={styles.resultText}>
                          Std Dev: {batchAnalysis.stdDev.toFixed(3)}m
                        </Text>
                        <Text style={styles.resultText}>
                          Median: {batchAnalysis.medianError.toFixed(3)}m
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.resultText, { fontWeight: "bold" }]}
                        >
                          Performance
                        </Text>
                        <Text style={styles.resultText}>
                          Avg Time: {batchAnalysis.avgDuration.toFixed(2)}ms
                        </Text>
                        <Text style={styles.resultText}>
                          Avg Iterations:{" "}
                          {batchAnalysis.avgIterations.toFixed(1)}
                        </Text>
                        <Text style={styles.resultText}>
                          Min Err: {batchAnalysis.minError.toFixed(3)}m
                        </Text>
                        <Text style={styles.resultText}>
                          Max Err: {batchAnalysis.maxError.toFixed(3)}m
                        </Text>
                      </View>
                    </View>

                    <View
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: "#eee",
                        paddingTop: 10,
                        marginBottom: 10,
                      }}
                    >
                      <Text style={[styles.resultText, { fontWeight: "bold" }]}>
                        Success Rates
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                        }}
                      >
                        <Text style={styles.resultText}>
                          Error &lt; 1.0m:{" "}
                          {batchAnalysis.successRate1m.toFixed(1)}%
                        </Text>
                        <Text style={styles.resultText}>
                          Error &lt; 2.0m:{" "}
                          {batchAnalysis.successRate2m.toFixed(1)}%
                        </Text>
                      </View>
                    </View>

                    <View
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: "#eee",
                        paddingTop: 10,
                      }}
                    >
                      <Text style={[styles.resultText, { fontWeight: "bold" }]}>
                        Best Runs (Lowest Error)
                      </Text>
                      <View style={{ maxHeight: 120, marginTop: 5 }}>
                        <ScrollView nestedScrollEnabled={true}>
                          {batchAnalysis.bestRuns.map((r, i) => (
                            <TouchableOpacity
                              key={i}
                              onPress={() => {
                                const index = results.findIndex(
                                  (res) => res.id === r.id,
                                );
                                if (index !== -1) setSelectedResultIndex(index);
                              }}
                            >
                              <Text
                                style={[styles.resultText, { color: "#666" }]}
                              >
                                {i + 1}. Run {r.id}: {r.error.toFixed(3)}m (
                                {r.duration.toFixed(1)}ms)
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    </View>

                    {testMode === "sweep" && sweepResults.length > 0 && (
                      <View
                        style={{
                          borderTopWidth: 1,
                          borderTopColor: "#eee",
                          paddingTop: 10,
                          marginBottom: 10,
                        }}
                      >
                        <Text
                          style={[styles.resultText, { fontWeight: "bold" }]}
                        >
                          Best Parameter Value
                        </Text>
                        {(() => {
                          const bestStep = [...sweepResults].sort(
                            (a, b) => a.avgError - b.avgError,
                          )[0];
                          return (
                            <Text style={styles.resultText}>
                              {sweepConfig.param}: {bestStep.val.toFixed(4)}{" "}
                              (Avg Error: {bestStep.avgError.toFixed(3)}m, Avg
                              Iter: {bestStep.avgIterations.toFixed(1)})
                            </Text>
                          );
                        })()}
                      </View>
                    )}

                    {testMode === "sweep" && sweepResults.length > 0 && (
                      <SweepGraph
                        results={sweepResults}
                        paramName={sweepConfig.param}
                        selectedIndex={selectedSweepIndex}
                        onSelectPoint={(idx) => {
                          setSelectedSweepIndex(idx);
                          // Select the first run of this sweep step
                          const sweepStep = sweepResults[idx];
                          if (sweepStep && sweepStep.runs.length > 0) {
                            const firstRunId = sweepStep.runs[0].id;
                            const resultIdx = results.findIndex(
                              (r) => r.id === firstRunId,
                            );
                            if (resultIdx !== -1) {
                              setSelectedResultIndex(resultIdx);
                            }
                          }
                        }}
                      />
                    )}
                  </View>
                </View>
              </CollapsibleSection>
            )}

            <CollapsibleSection title="Individual Runs">
              <Dropdown
                label="Select Run"
                value={selectedResultIndex.toString()}
                options={results.map((r, i) => ({
                  label:
                    testMode === "sweep"
                      ? `Run ${i + 1} (${sweepConfig.param}=${r.params[
                          sweepConfig.param
                        ].toFixed(2)}) - Err: ${r.error.toFixed(2)}m`
                      : `Run ${i + 1} - Err: ${r.error.toFixed(2)}m`,
                  value: i.toString(),
                }))}
                onSelect={(v) => setSelectedResultIndex(parseInt(v))}
                onToggle={(open) => setScrollEnabled(!open)}
              />

              {selectedResult && (
                <View style={styles.logBatchContainer}>
                  <View style={styles.logBatchHeader}>
                    <View>
                      <Text style={styles.logBatchTitle}>
                        Run {selectedResultIndex + 1}
                      </Text>
                      <Text style={styles.logBatchTime}>
                        ID: {selectedResult.id}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.copyButton}
                      onPress={async () => {
                        const text = `Run ${selectedResultIndex + 1} Details:
Error: ${selectedResult.error.toFixed(3)}m
RSSI RMSE: ${selectedResult.rssiRmse.toFixed(3)}
Time: ${selectedResult.duration.toFixed(2)}ms
Iterations: ${selectedResult.iterations}
Est Pos: (${selectedResult.estPos.x.toFixed(2)}, ${selectedResult.estPos.y.toFixed(2)})
True Pos: (${selectedResult.truePos.x.toFixed(2)}, ${selectedResult.truePos.y.toFixed(2)})`;
                        await Clipboard.setStringAsync(text);
                        Alert.alert(
                          "Copied",
                          "Run details copied to clipboard",
                        );
                      }}
                    >
                      <Text style={styles.copyButtonText}>Copy</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.logEntries, { maxHeight: undefined }]}>
                    <Text style={styles.resultText}>
                      Error: {selectedResult.error.toFixed(2)}m
                    </Text>
                    <Text style={styles.resultText}>
                      RSSI RMSE: {selectedResult.rssiRmse.toFixed(2)}
                    </Text>
                    <Text style={styles.resultText}>
                      Time: {selectedResult.duration.toFixed(2)}ms
                    </Text>
                    <Text style={styles.resultText}>
                      Iterations: {selectedResult.iterations}
                    </Text>
                    <Text style={styles.resultText}>
                      Est Pos: ({selectedResult.estPos.x.toFixed(2)},{" "}
                      {selectedResult.estPos.y.toFixed(2)})
                    </Text>
                    <Text style={styles.resultText}>
                      True Pos: ({selectedResult.truePos.x.toFixed(2)},{" "}
                      {selectedResult.truePos.y.toFixed(2)})
                    </Text>
                    {testMode === "sweep" && (
                      <Text style={[styles.resultText, { fontWeight: "bold" }]}>
                        {sweepConfig.param}:{" "}
                        {selectedResult.params[sweepConfig.param]}
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </CollapsibleSection>
          </>
        )}

        {!isRunning && viewMode === "results" && logBatches.length > 0 && (
          <CollapsibleSection title="Logs" defaultOpen={false}>
            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: "#d32f2f", marginBottom: 15 },
              ]}
              onPress={() => setLogBatches([])}
            >
              <Text style={styles.buttonText}>Clear All Logs</Text>
            </TouchableOpacity>

            {logBatches.map((batch) => (
              <View key={batch.id} style={styles.logBatchContainer}>
                <View style={styles.logBatchHeader}>
                  <View>
                    <Text style={styles.logBatchTitle}>{batch.type} Run</Text>
                    <Text style={styles.logBatchTime}>
                      {new Date(batch.startTime).toLocaleString()}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.copyButton}
                    onPress={async () => {
                      const text = batch.entries
                        .map(
                          (e) =>
                            `[${new Date(e.timestamp).toLocaleTimeString()}] ${
                              e.message
                            }`,
                        )
                        .join("\n");
                      await Clipboard.setStringAsync(text);
                      Alert.alert("Copied", "Logs copied to clipboard");
                    }}
                  >
                    <Text style={styles.copyButtonText}>Copy</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={styles.logEntries}
                  nestedScrollEnabled={true}
                >
                  {batch.entries.map((entry, i) => (
                    <Text key={i} style={styles.logText}>
                      <Text style={styles.logTimestamp}>
                        [{new Date(entry.timestamp).toLocaleTimeString()}]
                      </Text>{" "}
                      {entry.message}
                    </Text>
                  ))}
                </ScrollView>
              </View>
            ))}
          </CollapsibleSection>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  backButton: {
    position: "absolute",
    left: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  backButtonText: {
    fontSize: 24,
    color: "#333",
    fontWeight: "bold",
    lineHeight: 28,
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
    borderWidth: 1,
    borderColor: "#ddd",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#fcfcfc",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  sectionContent: {
    padding: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: ACCENT_COLOR,
  },
  collapseIcon: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#999",
    width: 20,
    textAlign: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  labelContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
  },
  labelText: {
    fontSize: 14,
    color: "#333",
  },
  controlWrapper: {
    width: 140,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    backgroundColor: "#fafafa",
    width: "100%",
    color: "#333",
  },
  dropdownButton: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 10,
    backgroundColor: "#fafafa",
    width: "100%",
  },
  dropdownButtonText: {
    fontSize: 14,
    color: "#333",
  },
  dropdownList: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#bbb",
    borderRadius: 6,
    marginTop: 4,
  },
  dropdownModalContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    elevation: 50,
  },
  dropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  dropdownModalList: {
    position: "absolute",
    zIndex: 2001,
    elevation: 50,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  dropdownItemText: {
    fontSize: 14,
    color: "#333",
  },
  controls: {
    flexDirection: "row",
    marginVertical: 20,
    justifyContent: "center",
  },
  button: {
    flex: 1,
    backgroundColor: ACCENT_COLOR,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  buttonDisabled: {
    backgroundColor: "#ccc",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: "#eee",
    borderRadius: 3,
    marginTop: 15,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: ACCENT_COLOR,
  },
  resultBox: {
    backgroundColor: "#f9f9f9",
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#eee",
  },
  resultText: {
    fontSize: 13,
    color: "#444",
    fontFamily: "monospace",
    lineHeight: 18,
  },
  logBatchContainer: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: 15,
    overflow: "hidden",
  },
  logBatchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  logBatchTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
  },
  logBatchTime: {
    fontSize: 11,
    color: "#666",
    marginTop: 2,
  },
  copyButton: {
    backgroundColor: ACCENT_COLOR,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  copyButtonText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },
  logEntries: {
    padding: 12,
    backgroundColor: "#fafafa",
    maxHeight: 300,
  },
  logText: {
    fontSize: 11,
    marginBottom: 2,
    color: "#333",
    fontFamily: "monospace",
  },
  logTimestamp: {
    color: "#888",
  },
  fieldContainer: {
    marginVertical: 20,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  field: {
    backgroundColor: "#f0f0f0",
    position: "relative",
    borderRadius: 8,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 15,
    marginBottom: 8,
  },
  legendText: {
    fontSize: 12,
    color: "#666",
  },
  legendMarkerBase: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#fff",
    marginRight: 6,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
    paddingVertical: 5,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: ACCENT_COLOR,
    borderRadius: 4,
    marginRight: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: ACCENT_COLOR,
  },
});
