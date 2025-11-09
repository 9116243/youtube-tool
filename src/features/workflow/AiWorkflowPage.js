"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiWorkflowPage = AiWorkflowPage;
var react_1 = require("react");
var framer_motion_1 = require("framer-motion");
var lucide_react_1 = require("lucide-react");
var PageHeader_1 = require("@/components/ui/PageHeader");
var badge_1 = require("@/components/ui/badge");
var button_1 = require("@/components/ui/button");
var card_1 = require("@/components/ui/card");
var dialog_1 = require("@/components/ui/dialog");
var input_1 = require("@/components/ui/input");
var label_1 = require("@/components/ui/label");
var textarea_1 = require("@/components/ui/textarea");
var select_1 = require("@/components/ui/select");
var tabs_1 = require("@/components/ui/tabs");
var TemplateManager_1 = require("@/features/templates/TemplateManager");
var presets_1 = require("@/features/workflow/presets");
var ladder_1 = require("@/features/workflow/ladder");
var calc_1 = require("@/features/workflow/calc");
var store_1 = require("@/features/queue/store");
var use_toast_1 = require("@/hooks/use-toast");
var store_2 = require("@/lib/store");
var utils_1 = require("@/lib/utils");
var api_1 = require("@/lib/api");
var LANGUAGE_OPTIONS = [
    { value: "zh-CN", label: "Chinese (Simplified)" },
    { value: "en-US", label: "English (US)" },
    { value: "de-DE", label: "German" },
    { value: "es-ES", label: "Spanish" },
];
var VOICE_OPTIONS = [
    { value: "male-a", label: "Voice - Male A" },
    { value: "female-b", label: "Voice - Female B" },
    { value: "narrator-pro", label: "Narrator - Pro" },
];
var ANALYSIS_OPTIONS = [
    { value: "360p", label: "360p - Fastest" },
    { value: "480p", label: "480p - Balanced" },
    { value: "720p", label: "720p - Highest fidelity" },
];
var OUTPUT_OPTIONS = [
    { value: "360p", label: "360p - Proxy" },
    { value: "720p", label: "720p - Web HD" },
    { value: "1080p", label: "1080p - Full HD" },
    { value: "1440p", label: "1440p - 2K delivery" },
    { value: "2160p", label: "2160p - 4K master" },
    { value: "source", label: "Source - Match input" },
];
var ENCODER_OPTIONS = [
    { value: "h264_nvenc", label: "H.264 (NVENC)" },
    { value: "h264", label: "H.264 (CPU)" },
    { value: "libx264", label: "libx264 (CPU)" },
    { value: "hevc_nvenc", label: "H.265 (NVENC)" },
    { value: "hevc", label: "H.265 (CPU)" },
    { value: "libx265", label: "libx265 (CPU)" },
    { value: "av1_nvenc", label: "AV1 (NVENC)" },
    { value: "av1", label: "AV1 (CPU)" },
    { value: "h264_qsv", label: "H.264 (Intel QSV)" },
    { value: "hevc_qsv", label: "H.265 (Intel QSV)" },
    { value: "hevc_amf", label: "H.265 (AMD AMF)" },
];
var CONTAINER_OPTIONS = [
    { value: "mp4", label: "MP4" },
    { value: "mkv", label: "Matroska (MKV)" },
    { value: "mov", label: "QuickTime (MOV)" },
];
var UPSCALE_OPTIONS = [
    { value: "none", label: "No upscaling" },
    { value: "fsrcnnx", label: "FSRCNNX" },
    { value: "realesrgan-x2", label: "Real-ESRGAN x2" },
    { value: "realesrgan-x4", label: "Real-ESRGAN x4" },
];
var DENOISE_OPTIONS = [
    { value: "off", label: "Off" },
    { value: "hqdn3d", label: "HQDN3D" },
    { value: "nlmeans", label: "Non-local Means" },
];
var HDR_OPTIONS = [
    { value: "none", label: "Disabled" },
    { value: "pq", label: "PQ (HDR10)" },
    { value: "hlg", label: "HLG" },
];
var AUDIO_CODEC_OPTIONS = [
    { value: "aac", label: "AAC" },
    { value: "opus", label: "Opus" },
    { value: "flac", label: "FLAC" },
];
var AUDIO_CHANNEL_OPTIONS = [
    { value: "mono", label: "Mono" },
    { value: "stereo", label: "Stereo" },
    { value: "5.1", label: "5.1 Surround" },
];
var AUDIO_SAMPLE_OPTIONS = [
    { value: 44100, label: "44.1 kHz" },
    { value: 48000, label: "48 kHz" },
];
var AUDIO_LOUDNESS_OPTIONS = [
    { value: "off", label: "Off" },
    { value: "ebu-r128", label: "EBU R128 (-23 LUFS)" },
];
var DIALOGUE_ENHANCE_OPTIONS = [
    { value: "off", label: "Disabled" },
    { value: "voice-boost-1", label: "Voice boost +3dB" },
    { value: "voice-boost-2", label: "Voice boost +6dB" },
];
var COLOR_SPACE_OPTIONS = [
    { value: "rec709", label: "Rec.709" },
    { value: "rec2020", label: "Rec.2020" },
    { value: "p3", label: "Display P3" },
];
var TRANSFER_OPTIONS = [
    { value: "gamma2.2", label: "Gamma 2.2" },
    { value: "gamma2.4", label: "Gamma 2.4" },
    { value: "hlg", label: "HLG" },
    { value: "pq", label: "PQ" },
];
var TONE_MAP_OPTIONS = [
    { value: "off", label: "Off" },
    { value: "hable", label: "Hable" },
    { value: "mobius", label: "Mobius" },
    { value: "reinhard", label: "Reinhard" },
    { value: "bt2390", label: "BT.2390" },
];
var LUT_PRESETS = [
    { value: "none", label: "None" },
    { value: "neon-bloom.cube", label: "Neon Bloom" },
    { value: "film-soft.cube", label: "Film Soft" },
    { value: "teal-orange.cube", label: "Teal & Orange" },
];
function findPreset(id) {
    return presets_1.STYLE_PRESETS.find(function (preset) { return preset.id === id; });
}
function serializeWorkflowForm(form) {
    return Object.entries(form).reduce(function (acc, _a) {
        var key = _a[0], value = _a[1];
        if (value === undefined)
            return acc;
        if (Array.isArray(value)) {
            acc[key] = value.map(function (item) {
                return typeof item === "object" && item !== null ? __assign({}, item) : item;
            });
            return acc;
        }
        if (value !== null && typeof value === "object") {
            acc[key] = __assign({}, value);
            return acc;
        }
        acc[key] = value;
        return acc;
    }, {});
}
function Field(_a) {
    var label = _a.label, description = _a.description, error = _a.error, children = _a.children;
    return (<div className="space-y-2">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-white">{label}</span>
        {description ? <span className="text-xs text-slate-400">{description}</span> : null}
      </div>
      {children}
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>);
}
function SwitchControl(_a) {
    var checked = _a.checked, onChange = _a.onChange, label = _a.label;
    return (<button type="button" role="switch" aria-checked={checked} onClick={function () { return onChange(!checked); }} className="relative flex h-9 w-16 items-center rounded-full border border-white/15 bg-white/10 px-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50" aria-label={label}>
      <framer_motion_1.motion.span layout className="h-7 w-7 rounded-full bg-white shadow-[0_0_18px_rgba(34,211,238,0.55)]" initial={false} animate={{ x: checked ? 28 : 0 }} transition={{ type: "spring", stiffness: 260, damping: 22 }}/>
    </button>);
}
function LadderStepRow(_a) {
    var index = _a.index, res = _a.res, bitrate = _a.bitrate, maxrate = _a.maxrate, onChange = _a.onChange, onRemove = _a.onRemove;
    return (<div className="grid gap-2 rounded-xl border border-white/10 bg-white/5 p-3 md:grid-cols-[1fr_1fr_1fr_auto]">
      <select_1.Select value={res} onValueChange={function (value) { return onChange({ res: value }); }}>
        <select_1.SelectTrigger>
          <select_1.SelectValue placeholder="Resolution"/>
        </select_1.SelectTrigger>
        <select_1.SelectContent>
          {["480p", "720p", "1080p", "1440p", "2160p"].map(function (option) { return (<select_1.SelectItem key={option} value={option}>
              {option.toUpperCase()}
            </select_1.SelectItem>); })}
        </select_1.SelectContent>
      </select_1.Select>
      <input_1.Input type="number" min="1" value={bitrate} onChange={function (event) { return onChange({ bitrateKbps: Number(event.target.value) }); }} placeholder="Bitrate (kbps)"/>
      <input_1.Input type="number" min="0" value={maxrate !== null && maxrate !== void 0 ? maxrate : ""} onChange={function (event) {
            return onChange({
                maxrateKbps: event.target.value ? Number(event.target.value) : undefined,
            });
        }} placeholder="Maxrate (kbps)"/>
      <button_1.Button variant="ghost" size="sm" className="justify-self-end text-rose-300 hover:text-rose-100" onClick={onRemove} aria-label={"Remove ladder step ".concat(index + 1)}>
        Remove
      </button_1.Button>
    </div>);
}
function AiWorkflowPage() {
    var _this = this;
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
    var toast = (0, use_toast_1.useToast)().toast;
    var form = (0, store_2.useWorkflowFormStore)(function (state) { return state.form; });
    var errors = (0, store_2.useWorkflowFormStore)(function (state) { return state.errors; });
    var setField = (0, store_2.useWorkflowFormStore)(function (state) { return state.setField; });
    var applyPreset = (0, store_2.useWorkflowFormStore)(function (state) { return state.applyPreset; });
    var validate = (0, store_2.useWorkflowFormStore)(function (state) { return state.validate; });
    var addLocalTask = (0, store_2.useWorkflowFormStore)(function (state) { return state.addTask; });
    var tasks = (0, store_2.useWorkflowFormStore)(function (state) { return state.tasks; });
    var setSubtitleTracks = (0, store_2.useWorkflowFormStore)(function (state) { return state.setSubtitleTracks; });
    var queueAddTask = (0, store_1.useQueueStore)(function (state) { return state.addTask; });
    var capabilities = (0, store_2.useAppStore)(function (state) { return state.capabilities; });
    var setCapabilities = (0, store_2.useAppStore)(function (state) { return state.setCapabilities; });
    var _u = (0, react_1.useState)(false), capabilityLoading = _u[0], setCapabilityLoading = _u[1];
    var _v = (0, react_1.useState)(false), isSubmitting = _v[0], setIsSubmitting = _v[1];
    var _w = (0, react_1.useState)(false), advancedOpen = _w[0], setAdvancedOpen = _w[1];
    var _x = (0, react_1.useState)(false), hdrPanelOpen = _x[0], setHdrPanelOpen = _x[1];
    var _y = (0, react_1.useState)(form.videoBitrateKbps === "auto" ? "auto" : "custom"), bitrateMode = _y[0], setBitrateMode = _y[1];
    var _z = (0, react_1.useState)("YouTube-like"), ladderPresetId = _z[0], setLadderPresetId = _z[1];
    var _0 = (0, react_1.useState)(false), templateDialogOpen = _0[0], setTemplateDialogOpen = _0[1];
    var subtitleTracks = (_a = form.subtitleTracks) !== null && _a !== void 0 ? _a : [];
    (0, react_1.useEffect)(function () {
        if (!capabilities && !capabilityLoading) {
            setCapabilityLoading(true);
            void (0, api_1.fetchRendererCapabilities)()
                .then(function (caps) { return setCapabilities(caps); })
                .catch(function () {
                toast({
                    title: "Capabilities unavailable",
                    description: "Falling back to default hardware assumptions.",
                });
            })
                .finally(function () { return setCapabilityLoading(false); });
        }
    }, [capabilities, capabilityLoading, setCapabilities, toast]);
    (0, react_1.useEffect)(function () {
        if (form.deliveryMode === "ladder" && !form.ladderProfile) {
            var preset = ladder_1.LADDER_PRESETS[0];
            setField("ladderProfile", (0, ladder_1.cloneLadderProfile)(preset));
        }
    }, [form.deliveryMode, form.ladderProfile, setField]);
    (0, react_1.useEffect)(function () {
        if (bitrateMode === "recommend") {
            var recommendation = (0, presets_1.getRecommendedBitrate)(form.outputResolution);
            setField("videoBitrateKbps", recommendation.target);
        }
        else if (bitrateMode === "auto") {
            setField("videoBitrateKbps", "auto");
        }
    }, [bitrateMode, form.outputResolution, setField]);
    var selectedPreset = (0, react_1.useMemo)(function () { var _a; return (_a = findPreset(form.stylePreset)) !== null && _a !== void 0 ? _a : presets_1.STYLE_PRESETS[0]; }, [form.stylePreset]);
    var subtitleStyle = (0, react_1.useMemo)(function () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        return ({
            font: (_b = (_a = form.subtitleStyle) === null || _a === void 0 ? void 0 : _a.font) !== null && _b !== void 0 ? _b : "Inter",
            size: (_d = (_c = form.subtitleStyle) === null || _c === void 0 ? void 0 : _c.size) !== null && _d !== void 0 ? _d : 32,
            color: (_f = (_e = form.subtitleStyle) === null || _e === void 0 ? void 0 : _e.color) !== null && _f !== void 0 ? _f : "#ffffff",
            outline: (_h = (_g = form.subtitleStyle) === null || _g === void 0 ? void 0 : _g.outline) !== null && _h !== void 0 ? _h : "#000000",
            shadow: (_k = (_j = form.subtitleStyle) === null || _j === void 0 ? void 0 : _j.shadow) !== null && _k !== void 0 ? _k : "rgba(0,0,0,0.45)",
            position: (_m = (_l = form.subtitleStyle) === null || _l === void 0 ? void 0 : _l.position) !== null && _m !== void 0 ? _m : "bottom",
        });
    }, [form.subtitleStyle]);
    var durationMinutes = (0, react_1.useMemo)(function () { return (0, calc_1.estimateDurationMinutes)(form); }, [form]);
    var estimatedSizeMB = (0, react_1.useMemo)(function () { return (0, calc_1.estimateSizeMB)(form); }, [form]);
    var resolvedBitrate = (0, react_1.useMemo)(function () { return (0, calc_1.resolveVideoBitrate)(form); }, [form]);
    var recommendedBitrate = (0, react_1.useMemo)(function () { return (0, presets_1.getRecommendedBitrate)(form.outputResolution); }, [form.outputResolution]);
    var splitPlanInfo = (0, react_1.useMemo)(function () { return (0, utils_1.splitPlan)(durationMinutes, form.maxSegmentDuration); }, [durationMinutes, form.maxSegmentDuration]);
    var performanceContext = (0, react_1.useMemo)(function () { return ({
        durationMinutes: durationMinutes,
        segmented: form.segmented,
        segmentMaxMinutes: form.segmented ? form.maxSegmentDuration : undefined,
        ladderSteps: form.deliveryMode === "ladder" && form.ladderProfile
            ? form.ladderProfile.steps.length
            : undefined,
    }); }, [
        durationMinutes,
        form.deliveryMode,
        form.ladderProfile,
        form.maxSegmentDuration,
        form.segmented,
    ]);
    var estimatedRenderSeconds = (0, react_1.useMemo)(function () { return (0, calc_1.estimateRenderSeconds)(form, performanceContext); }, [form, performanceContext]);
    var estimatedVRAM = (0, react_1.useMemo)(function () { return (0, calc_1.estimateVRAM)(form, performanceContext); }, [form, performanceContext]);
    var renderTimeFormatted = (0, react_1.useMemo)(function () { return (0, utils_1.formatDuration)(estimatedRenderSeconds); }, [estimatedRenderSeconds]);
    var performanceNotes = (0, react_1.useMemo)(function () {
        var notes = [];
        if (form.upscale !== "none") {
            notes.push("Upscale ".concat(form.upscale));
        }
        if (form.hdrMode !== "none") {
            notes.push("HDR ".concat(form.hdrMode.toUpperCase()));
        }
        if (form.subtitleMode === "burn-in") {
            notes.push("Subtitles burn-in");
        }
        else if (form.subtitleMode === "soft" && subtitleTracks.length) {
            notes.push("".concat(subtitleTracks.length, " subtitle tracks"));
        }
        if (form.deliveryMode === "ladder" && form.ladderProfile) {
            notes.push("".concat(form.ladderProfile.steps.length, " rung ladder"));
        }
        if (form.denoise !== "off") {
            notes.push("Denoise ".concat(form.denoise));
        }
        return notes;
    }, [form.deliveryMode, form.denoise, form.hdrMode, form.ladderProfile, form.subtitleMode, form.upscale, subtitleTracks.length]);
    var warnings = (0, react_1.useMemo)(function () {
        var list = [];
        if (form.outputResolution === "2160p" &&
            (form.encoder === "libx264" || form.encoder === "h264")) {
            list.push("libx264 at 4K is extremely slow. Prefer HEVC or AV1 hardware encoders for UHD delivery.");
        }
        if (form.hdrMode !== "none" &&
            form.container === "mp4" &&
            (form.encoder.includes("h264") || form.encoder.includes("libx264"))) {
            list.push("HDR inside MP4 with H.264 is not widely supported. Consider HEVC or Matroska container.");
        }
        if (form.outputResolution === "source" && form.upscale !== "none") {
            list.push("Upscaling is disabled when output is set to source resolution.");
        }
        if (form.colorSpace === "rec709" && form.hdrMode !== "none") {
            list.push("HDR workflows require Rec.2020 color space. Switch color space accordingly.");
        }
        if (form.encoder === "av1_nvenc" && capabilities && !capabilities.av1) {
            list.push("This hardware profile does not expose AV1 NVENC. Fallback to CPU encoding is expected.");
        }
        if (form.toneMap !== "off" && form.hdrMode === "none") {
            list.push("Tone mapping is enabled without HDR input. Confirm this is intentional.");
        }
        if ((capabilities === null || capabilities === void 0 ? void 0 : capabilities.vramMB) && estimatedVRAM > capabilities.vramMB) {
            list.push("Estimated VRAM consumption (".concat(estimatedVRAM, " MB) exceeds detected capacity (").concat(capabilities.vramMB, " MB). Reduce resolution, filters, or ladder rungs."));
        }
        else if (!(capabilities === null || capabilities === void 0 ? void 0 : capabilities.vramMB) && estimatedVRAM > 12000) {
            list.push("Configuration may require ~".concat(estimatedVRAM, " MB of VRAM. Ensure your GPU has sufficient memory."));
        }
        if (form.upscale === "realesrgan-x4" && (capabilities === null || capabilities === void 0 ? void 0 : capabilities.vramMB) && capabilities.vramMB < 10000) {
            list.push("Real-ESRGAN x4 is heavy on VRAM. Consider x2 or disable upscaling on this GPU.");
        }
        if (form.subtitleMode === "burn-in" && subtitleTracks.length === 0) {
            list.push("Burn-in selected but no subtitle tracks attached. Add captions or switch modes.");
        }
        if (form.deliveryMode === "ladder" && form.ladderProfile && form.ladderProfile.steps.length > 4) {
            list.push("Large bitrate ladders will extend render time. Ensure downstream needs every rung.");
        }
        return list;
    }, [
        capabilities,
        estimatedVRAM,
        form.colorSpace,
        form.container,
        form.deliveryMode,
        form.encoder,
        form.hdrMode,
        form.ladderProfile,
        form.outputResolution,
        form.toneMap,
        form.upscale,
        subtitleTracks.length,
    ]);
    var handleBitrateModeChange = function (mode) {
        setBitrateMode(mode);
        if (mode === "custom" && form.videoBitrateKbps === "auto") {
            var recommendation = (0, presets_1.getRecommendedBitrate)(form.outputResolution);
            setField("videoBitrateKbps", recommendation.target);
        }
    };
    var handleLadderPreset = function (value) {
        setLadderPresetId(value);
        var preset = ladder_1.LADDER_PRESETS.find(function (item) { return item.name === value; });
        if (preset) {
            setField("ladderProfile", (0, ladder_1.cloneLadderProfile)(preset));
        }
    };
    var updateLadderStep = function (index, part) {
        var ladder = form.ladderProfile;
        if (!ladder)
            return;
        var updated = __assign(__assign({}, ladder), { steps: ladder.steps.map(function (step, idx) {
                return idx === index ? __assign(__assign({}, step), part) : __assign({}, step);
            }) });
        setField("ladderProfile", updated);
    };
    var addLadderStep = function () {
        var ladder = form.ladderProfile;
        if (!ladder)
            return;
        var last = ladder.steps[ladder.steps.length - 1];
        var nextStep = (last === null || last === void 0 ? void 0 : last.res) === "1080p"
            ? "1440p"
            : (last === null || last === void 0 ? void 0 : last.res) === "1440p"
                ? "2160p"
                : "1080p";
        var updated = __assign(__assign({}, ladder), { steps: __spreadArray(__spreadArray([], ladder.steps, true), [
                {
                    res: nextStep,
                    bitrateKbps: last ? Math.round(last.bitrateKbps * 1.6) : 6000,
                    maxrateKbps: (last === null || last === void 0 ? void 0 : last.maxrateKbps) ? Math.round(last.maxrateKbps * 1.6) : undefined,
                },
            ], false) });
        setField("ladderProfile", updated);
    };
    var removeLadderStep = function (index) {
        var ladder = form.ladderProfile;
        if (!ladder)
            return;
        var updated = __assign(__assign({}, ladder), { steps: ladder.steps.filter(function (_, idx) { return idx !== index; }) });
        setField("ladderProfile", updated);
    };
    var exportLadder = function () {
        if (!form.ladderProfile)
            return;
        void navigator.clipboard
            .writeText(JSON.stringify(form.ladderProfile, null, 2))
            .then(function () {
            return toast({
                title: "Ladder copied",
                description: "JSON payload copied to clipboard.",
            });
        })
            .catch(function () {
            return toast({
                title: "Copy failed",
                description: "Unable to copy. Please check clipboard permissions.",
                variant: "destructive",
            });
        });
    };
    var importLadder = function () {
        var _a, _b, _c, _d;
        var raw = window.prompt("Paste ladder JSON");
        if (!raw)
            return;
        try {
            var parsed = JSON.parse(raw);
            if (!((_a = parsed === null || parsed === void 0 ? void 0 : parsed.steps) === null || _a === void 0 ? void 0 : _a.length))
                throw new Error("Invalid ladder");
            setField("ladderProfile", (0, ladder_1.cloneLadderProfile)(parsed));
            setLadderPresetId((_b = parsed.name) !== null && _b !== void 0 ? _b : "Custom");
            toast({ title: "Ladder imported", description: (_c = parsed.name) !== null && _c !== void 0 ? _c : "Custom profile" });
        }
        catch (error) {
            toast({
                title: "Import failed",
                description: (_d = error.message) !== null && _d !== void 0 ? _d : "Invalid ladder JSON",
                variant: "destructive",
            });
        }
    };
    var handleSubtitleUpload = function (event) {
        var files = event.target.files;
        if (!files || files.length === 0)
            return;
        var additions = Array.from(files).map(function (file, index) { return ({
            id: "sub-".concat(Date.now().toString(36), "-").concat(index),
            language: form.language,
            path: file.name,
            label: file.name.replace(/\.[^/.]+$/, ""),
        }); });
        setSubtitleTracks(__spreadArray(__spreadArray([], subtitleTracks, true), additions, true));
        // clear value to allow re-selecting same file
        event.target.value = "";
    };
    var handleSubtitleLanguageChange = function (id, language) {
        setSubtitleTracks(subtitleTracks.map(function (track) { return (track.id === id ? __assign(__assign({}, track), { language: language }) : track); }));
    };
    var handleSubtitleLabelChange = function (id, label) {
        setSubtitleTracks(subtitleTracks.map(function (track) { return (track.id === id ? __assign(__assign({}, track), { label: label }) : track); }));
    };
    var handleSubtitleRemove = function (id) {
        setSubtitleTracks(subtitleTracks.filter(function (track) { return track.id !== id; }));
    };
    var updateSubtitleStyle = function (patch) {
        var next = __assign(__assign({}, subtitleStyle), patch);
        setField("subtitleStyle", next);
    };
    var handleLutChange = function (event) {
        var _a;
        var value = event.target.value.trim();
        if (!value) {
            setField("lut", undefined);
            return;
        }
        setField("lut", { name: (_a = value.split("/").pop()) !== null && _a !== void 0 ? _a : "Custom LUT", type: "cube", url: value });
    };
    var handleSubmit = function () { return __awaiter(_this, void 0, void 0, function () {
        var isValid, workflowTask, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    setIsSubmitting(true);
                    isValid = validate();
                    if (!isValid) {
                        toast({
                            title: "Validation failed",
                            description: "Check highlighted fields before submitting.",
                            variant: "destructive",
                        });
                        setIsSubmitting(false);
                        return [2 /*return*/];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, 4, 5]);
                    workflowTask = addLocalTask();
                    return [4 /*yield*/, queueAddTask({
                            title: workflowTask.label,
                            preset: workflowTask.preset,
                            params: serializeWorkflowForm(workflowTask.payload),
                        })];
                case 2:
                    _a.sent();
                    toast({
                        title: "Task submitted",
                        description: "Queued for rendering. Track progress in the live queue.",
                    });
                    return [3 /*break*/, 5];
                case 3:
                    error_1 = _a.sent();
                    console.error(error_1);
                    toast({
                        title: "Failed to submit task",
                        description: "Check the developer console for details.",
                        variant: "destructive",
                    });
                    return [3 /*break*/, 5];
                case 4:
                    setIsSubmitting(false);
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    }); };
    return (<>
      <dialog_1.Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <dialog_1.DialogContent className="max-h-[85vh] overflow-y-auto">
          <dialog_1.DialogHeader className="pb-4">
            <dialog_1.DialogTitle className="text-lg text-white">Template Manager</dialog_1.DialogTitle>
          </dialog_1.DialogHeader>
          <TemplateManager_1.default />
        </dialog_1.DialogContent>
      </dialog_1.Dialog>
      <div className="space-y-8">
      <PageHeader_1.default title="AI Workflow Builder" description="Curate presets, tune expert parameters, and submit production-ready jobs." actions={<div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <lucide_react_1.BookmarkCheck className="h-4 w-4 text-cyan-300" aria-hidden/>
            <span>{selectedPreset.name} preset loaded</span>
            {capabilityLoading ? (<span className="flex items-center gap-1 text-slate-400">
                <lucide_react_1.Loader2 className="h-3.5 w-3.5 animate-spin"/> Checking hardware
              </span>) : capabilities ? (<span className="text-slate-400">
                NVENC {capabilities.nvenc ? "supported" : "missing"} - AV1 {capabilities.av1 ? "supported" : "missing"}
              </span>) : (<span className="text-slate-400">Capabilities unknown</span>)}
            <button_1.Button type="button" variant="outline" size="sm" className="ml-2 border-cyan-400/30 text-cyan-200 hover:bg-cyan-500/10" onClick={function () { return setTemplateDialogOpen(true); }}>
              Templates
            </button_1.Button>
          </div>}/>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <card_1.Card className="bg-white/5 backdrop-blur-xl">
          <card_1.CardHeader className="pb-3">
            <card_1.CardTitle className="flex items-center gap-2 text-base">
              <lucide_react_1.Wand2 className="h-4 w-4 text-cyan-300"/>
              Workflow configuration
            </card_1.CardTitle>
            <card_1.CardDescription>
              Base settings for narration, pacing, segmentation, and render intent.
            </card_1.CardDescription>
          </card_1.CardHeader>
          <card_1.CardContent>
            <tabs_1.Tabs defaultValue="base" className="space-y-6">
              <tabs_1.TabsList className="bg-slate-900/50">
                <tabs_1.TabsTrigger value="base">Base parameters</tabs_1.TabsTrigger>
                <tabs_1.TabsTrigger value="expert">Expert mode</tabs_1.TabsTrigger>
              </tabs_1.TabsList>

              <tabs_1.TabsContent value="base" className="space-y-6 focus:outline-none">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Style preset" description="Select a design and motion profile.">
                    <select_1.Select value={form.stylePreset} onValueChange={applyPreset}>
                      <select_1.SelectTrigger>
                        <select_1.SelectValue placeholder="Select preset"/>
                      </select_1.SelectTrigger>
                      <select_1.SelectContent>
                        {presets_1.STYLE_PRESETS.map(function (preset) { return (<select_1.SelectItem key={preset.id} value={preset.id}>
                            {preset.name}
                          </select_1.SelectItem>); })}
                      </select_1.SelectContent>
                    </select_1.Select>
                  </Field>
                  <Field label="Language" description="Primary narration language.">
                    <select_1.Select value={form.language} onValueChange={function (value) { return setField("language", value); }}>
                      <select_1.SelectTrigger>
                        <select_1.SelectValue placeholder="Select language"/>
                      </select_1.SelectTrigger>
                      <select_1.SelectContent>
                        {LANGUAGE_OPTIONS.map(function (option) { return (<select_1.SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </select_1.SelectItem>); })}
                      </select_1.SelectContent>
                    </select_1.Select>
                  </Field>
                  <Field label="Voice profile" description="Match the desired narration persona.">
                    <select_1.Select value={form.voice} onValueChange={function (value) { return setField("voice", value); }}>
                      <select_1.SelectTrigger>
                        <select_1.SelectValue placeholder="Select voice"/>
                      </select_1.SelectTrigger>
                      <select_1.SelectContent>
                        {VOICE_OPTIONS.map(function (option) { return (<select_1.SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </select_1.SelectItem>); })}
                      </select_1.SelectContent>
                    </select_1.Select>
                  </Field>
                  <Field label="Transition style" description="Choose pacing between cuts.">
                    <select_1.Select value={form.transitionStyle} onValueChange={function (value) {
            return setField("transitionStyle", value);
        }}>
                      <select_1.SelectTrigger>
                        <select_1.SelectValue placeholder="Select transition"/>
                      </select_1.SelectTrigger>
                      <select_1.SelectContent>
                        {["cut", "crossfade", "zoom", "glitch"].map(function (option) { return (<select_1.SelectItem key={option} value={option}>
                            {option}
                          </select_1.SelectItem>); })}
                      </select_1.SelectContent>
                    </select_1.Select>
                  </Field>
                  <Field label="B-roll density" description="Supplementary footage intensity.">
                    <select_1.Select value={form.brollDensity} onValueChange={function (value) {
            return setField("brollDensity", value);
        }}>
                      <select_1.SelectTrigger>
                        <select_1.SelectValue placeholder="Select density"/>
                      </select_1.SelectTrigger>
                      <select_1.SelectContent>
                        {["minimal", "balanced", "rich"].map(function (option) { return (<select_1.SelectItem key={option} value={option}>
                            {option}
                          </select_1.SelectItem>); })}
                      </select_1.SelectContent>
                    </select_1.Select>
                  </Field>
                  <Field label="Delivery mode" description="Single encode or bitrate ladder.">
                    <div className="flex gap-2">
                      <button_1.Button type="button" variant={form.deliveryMode === "single" ? "default" : "outline"} onClick={function () { return setField("deliveryMode", "single"); }}>
                        Single target
                      </button_1.Button>
                      <button_1.Button type="button" variant={form.deliveryMode === "ladder" ? "default" : "outline"} onClick={function () { return setField("deliveryMode", "ladder"); }}>
                        Bitrate ladder
                      </button_1.Button>
                    </div>
                  </Field>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Shot count" description="Controls pacing and total runtime." error={errors.shotCount}>
                    <div className="space-y-2">
                      <input type="range" min={5} max={50} value={form.shotCount} onChange={function (event) { return setField("shotCount", Number(event.target.value)); }} className="w-full accent-cyan-400"/>
                      <div className="flex items-center justify-between text-xs text-slate-300">
                        <span>{form.shotCount} shots</span>
                        <span>~ {durationMinutes.toFixed(2)} min runtime</span>
                      </div>
                    </div>
                  </Field>
                  <Field label="Frame-rate analysis" description="Sampling frequency for motion detection." error={errors.frameRate}>
                    <input_1.Input type="number" step="0.1" min="0.1" value={form.frameRate} onChange={function (event) { return setField("frameRate", Number(event.target.value)); }}/>
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Analysis resolution" description="Lower values speed up cut detection without hurting output quality.">
                    <select_1.Select value={form.analysisResolution} onValueChange={function (value) {
            return setField("analysisResolution", value);
        }}>
                      <select_1.SelectTrigger>
                        <select_1.SelectValue placeholder="Select analysis resolution"/>
                      </select_1.SelectTrigger>
                      <select_1.SelectContent>
                        {ANALYSIS_OPTIONS.map(function (option) { return (<select_1.SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </select_1.SelectItem>); })}
                      </select_1.SelectContent>
                    </select_1.Select>
                  </Field>
                  <Field label="Output resolution" description="Final delivery resolution.">
                    <select_1.Select value={form.outputResolution} onValueChange={function (value) {
            return setField("outputResolution", value);
        }}>
                      <select_1.SelectTrigger>
                        <select_1.SelectValue placeholder="Select output resolution"/>
                      </select_1.SelectTrigger>
                      <select_1.SelectContent>
                        {OUTPUT_OPTIONS.map(function (option) { return (<select_1.SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </select_1.SelectItem>); })}
                      </select_1.SelectContent>
                    </select_1.Select>
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-[auto_1fr]">
                  <div className="space-y-2">
                    <span className="text-sm font-medium text-white">Segmented delivery</span>
                    <span className="text-xs text-slate-400">
                      Split renders for episodic uploads.
                    </span>
                    <SwitchControl checked={form.segmented} onChange={function (value) { return setField("segmented", value); }} label="Enable segmented delivery"/>
                  </div>
                  {form.segmented ? (<Field label="Max segment length (minutes)" description="Upper bound for each output chunk." error={errors.maxSegmentDuration}>
                      <input_1.Input type="number" min="1" value={form.maxSegmentDuration} onChange={function (event) {
                return setField("maxSegmentDuration", Number(event.target.value));
            }}/>
                    </Field>) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Cover template" description="Name the visual frame used for cover art automation." error={errors.coverTemplate}>
                    <input_1.Input value={form.coverTemplate} onChange={function (event) { return setField("coverTemplate", event.target.value); }} placeholder="Neon Pulse Overlay"/>
                  </Field>
                  <Field label="Creative notes" description="Optional directions for editors.">
                    <textarea_1.Textarea rows={3} placeholder="Highlight product callouts, social handles, or compliance reminders." value={(_b = form.notes) !== null && _b !== void 0 ? _b : ""} onChange={function (event) { return setField("notes", event.target.value || undefined); }}/>
                  </Field>
                </div>

                <Field label="Theme skin" description="Pick a color token for overlays and UI chrome.">
                  <div className="flex flex-wrap gap-3">
                    {presets_1.THEME_SWATCHES.map(function (swatch) { return (<button key={swatch.id} type="button" onClick={function () { return setField("theme", swatch.id); }} className={"flex h-12 w-12 items-center justify-center rounded-2xl border transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ".concat(form.theme === swatch.id
                ? "border-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.45)]"
                : "border-white/10")} aria-label={swatch.label}>
                        <span className="h-8 w-8 rounded-xl" style={{ background: swatch.value }} aria-hidden/>
                      </button>); })}
                  </div>
                </Field>
              </tabs_1.TabsContent>
              <tabs_1.TabsContent value="expert" className="space-y-6 focus:outline-none">
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-slate-200">
                    <lucide_react_1.SlidersHorizontal className="h-4 w-4 text-cyan-300"/>
                    Advanced encoding controls
                  </div>
                  <button_1.Button variant="ghost" size="sm" onClick={function () { return setAdvancedOpen(function (prev) { return !prev; }); }} className="flex items-center gap-2 text-xs text-slate-300">
                    {advancedOpen ? "Hide" : "Show"} parameters
                    <framer_motion_1.motion.span animate={{ rotate: advancedOpen ? 180 : 0 }}>
                      <lucide_react_1.SlidersHorizontal className="h-3.5 w-3.5"/>
                    </framer_motion_1.motion.span>
                  </button_1.Button>
                </div>

                {advancedOpen ? (<framer_motion_1.motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-5 rounded-2xl border border-white/10 bg-slate-900/50 p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Encoder" description="Select codec and hardware acceleration.">
                        <select_1.Select value={form.encoder} onValueChange={function (value) { return setField("encoder", value); }}>
                          <select_1.SelectTrigger>
                            <select_1.SelectValue placeholder="Select encoder"/>
                          </select_1.SelectTrigger>
                          <select_1.SelectContent>
                            {ENCODER_OPTIONS.map(function (option) { return (<select_1.SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </select_1.SelectItem>); })}
                          </select_1.SelectContent>
                        </select_1.Select>
                      </Field>
                      <Field label="Encoding preset" description="Speed versus quality trade-off.">
                        <select_1.Select value={(_c = form.encoderPreset) !== null && _c !== void 0 ? _c : "medium"} onValueChange={function (value) {
                return setField("encoderPreset", value);
            }}>
                          <select_1.SelectTrigger>
                            <select_1.SelectValue placeholder="Preset"/>
                          </select_1.SelectTrigger>
                          <select_1.SelectContent>
                            {["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"].map(function (preset) { return (<select_1.SelectItem key={preset} value={preset}>
                                {preset}
                              </select_1.SelectItem>); })}
                          </select_1.SelectContent>
                        </select_1.Select>
                      </Field>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Container">
                        <select_1.Select value={form.container} onValueChange={function (value) {
                return setField("container", value);
            }}>
                          <select_1.SelectTrigger>
                            <select_1.SelectValue placeholder="Select container"/>
                          </select_1.SelectTrigger>
                          <select_1.SelectContent>
                            {CONTAINER_OPTIONS.map(function (option) { return (<select_1.SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </select_1.SelectItem>); })}
                          </select_1.SelectContent>
                        </select_1.Select>
                      </Field>
                    </div>
                    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-white">Subtitles</p>
                          <p className="text-xs text-slate-400">
                            Attach caption tracks and control delivery mode.
                          </p>
                        </div>
                        <select_1.Select value={form.subtitleMode} onValueChange={function (value) { return setField("subtitleMode", value); }}>
                          <select_1.SelectTrigger className="w-40">
                            <select_1.SelectValue placeholder="Subtitle mode"/>
                          </select_1.SelectTrigger>
                          <select_1.SelectContent>
                            <select_1.SelectItem value="off">Off</select_1.SelectItem>
                            <select_1.SelectItem value="soft">Soft subtitles</select_1.SelectItem>
                            <select_1.SelectItem value="burn-in">Burn-in</select_1.SelectItem>
                          </select_1.SelectContent>
                        </select_1.Select>
                      </div>
                      {form.subtitleMode === "off" && subtitleTracks.length === 0 ? (<p className="text-xs text-slate-400">
                          Subtitles are disabled. Switch mode to soft or burn-in to include caption
                          files.
                        </p>) : (<>
                          <div className="space-y-3">
                            {subtitleTracks.map(function (track) {
                    var _a;
                    return (<div key={track.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-slate-900/40 p-3 text-xs text-slate-200">
                                <div className="min-w-[160px]">
                                  <label_1.Label htmlFor={"subtitle-lang-".concat(track.id)} className="text-[11px] uppercase text-slate-400">
                                    Language
                                  </label_1.Label>
                                  <select_1.Select value={track.language} onValueChange={function (value) {
                            return handleSubtitleLanguageChange(track.id, value);
                        }}>
                                    <select_1.SelectTrigger id={"subtitle-lang-".concat(track.id)} className="mt-1">
                                      <select_1.SelectValue placeholder="Language"/>
                                    </select_1.SelectTrigger>
                                    <select_1.SelectContent>
                                      {LANGUAGE_OPTIONS.map(function (option) { return (<select_1.SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </select_1.SelectItem>); })}
                                    </select_1.SelectContent>
                                  </select_1.Select>
                                </div>
                                <div className="flex-1 min-w-[160px]">
                                  <label_1.Label htmlFor={"subtitle-label-".concat(track.id)} className="text-[11px] uppercase text-slate-400">
                                    Label
                                  </label_1.Label>
                                  <input_1.Input id={"subtitle-label-".concat(track.id)} value={(_a = track.label) !== null && _a !== void 0 ? _a : ""} onChange={function (event) {
                            return handleSubtitleLabelChange(track.id, event.target.value);
                        }} className="mt-1" placeholder="Subtitle label"/>
                                </div>
                                <div className="flex items-center gap-2 text-slate-400">
                                  <span className="font-mono text-[11px]">{track.path}</span>
                                </div>
                                <button_1.Button type="button" variant="ghost" size="sm" className="ml-auto text-rose-300 hover:text-rose-100" onClick={function () { return handleSubtitleRemove(track.id); }}>
                                  Remove
                                </button_1.Button>
                              </div>);
                })}
                          </div>
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200 transition hover:border-cyan-400/70 hover:bg-cyan-500/20">
                            <lucide_react_1.Upload className="h-3.5 w-3.5"/>
                            Upload captions
                            <input type="file" accept=".srt,.ass,.vtt" multiple hidden onChange={handleSubtitleUpload}/>
                          </label>
                          {form.subtitleMode === "burn-in" ? (<div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-2">
                                <label_1.Label className="text-[11px] uppercase text-slate-400">Font</label_1.Label>
                                <input_1.Input value={subtitleStyle.font} onChange={function (event) {
                        return updateSubtitleStyle({ font: event.target.value });
                    }}/>
                              </div>
                              <div className="space-y-2">
                                <label_1.Label className="text-[11px] uppercase text-slate-400">
                                  Font size
                                </label_1.Label>
                                <input_1.Input type="number" min={8} value={subtitleStyle.size} onChange={function (event) {
                        return updateSubtitleStyle({ size: Number(event.target.value) });
                    }}/>
                              </div>
                              <div className="space-y-2">
                                <label_1.Label className="text-[11px] uppercase text-slate-400">
                                  Text color
                                </label_1.Label>
                                <input_1.Input type="color" value={subtitleStyle.color} onChange={function (event) {
                        return updateSubtitleStyle({ color: event.target.value });
                    }} className="h-10"/>
                              </div>
                              <div className="space-y-2">
                                <label_1.Label className="text-[11px] uppercase text-slate-400">
                                  Outline
                                </label_1.Label>
                                <input_1.Input type="color" value={subtitleStyle.outline} onChange={function (event) {
                        return updateSubtitleStyle({ outline: event.target.value });
                    }} className="h-10"/>
                              </div>
                              <div className="space-y-2">
                                <label_1.Label className="text-[11px] uppercase text-slate-400">
                                  Shadow
                                </label_1.Label>
                                <input_1.Input value={subtitleStyle.shadow} onChange={function (event) {
                        return updateSubtitleStyle({ shadow: event.target.value });
                    }} placeholder="rgba(0,0,0,0.45)"/>
                              </div>
                              <div className="space-y-2">
                                <label_1.Label className="text-[11px] uppercase text-slate-400">
                                  Position
                                </label_1.Label>
                                <select_1.Select value={subtitleStyle.position} onValueChange={function (value) {
                        return updateSubtitleStyle({ position: value });
                    }}>
                                  <select_1.SelectTrigger>
                                    <select_1.SelectValue placeholder="Position"/>
                                  </select_1.SelectTrigger>
                                  <select_1.SelectContent>
                                    <select_1.SelectItem value="bottom">Bottom</select_1.SelectItem>
                                    <select_1.SelectItem value="top">Top</select_1.SelectItem>
                                  </select_1.SelectContent>
                                </select_1.Select>
                              </div>
                            </div>) : null}
                        </>)}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                          Video bitrate strategy
                        </span>
                        <div className="flex gap-2">
                          <button_1.Button type="button" variant={bitrateMode === "auto" ? "default" : "outline"} onClick={function () { return handleBitrateModeChange("auto"); }}>
                            Auto
                          </button_1.Button>
                          <button_1.Button type="button" variant={bitrateMode === "recommend" ? "default" : "outline"} onClick={function () { return handleBitrateModeChange("recommend"); }}>
                            Recommend
                          </button_1.Button>
                          <button_1.Button type="button" variant={bitrateMode === "custom" ? "default" : "outline"} onClick={function () { return handleBitrateModeChange("custom"); }}>
                            Custom
                          </button_1.Button>
                        </div>
                        <Field label="Video bitrate (kbps)" description={"Recommended range: ".concat(recommendedBitrate.min, "-").concat(recommendedBitrate.max, " kbps")} error={errors.videoBitrateKbps}>
                          <input_1.Input type="number" min="1" value={form.videoBitrateKbps === "auto" ? "" : form.videoBitrateKbps} disabled={bitrateMode !== "custom"} onChange={function (event) {
                return setField("videoBitrateKbps", Number(event.target.value));
            }} placeholder="Enter kbps"/>
                        </Field>
                        <Field label="Max bitrate (kbps)" error={errors.maxBitrateKbps}>
                          <input_1.Input type="number" min="0" value={(_d = form.maxBitrateKbps) !== null && _d !== void 0 ? _d : ""} onChange={function (event) {
                return setField("maxBitrateKbps", event.target.value ? Number(event.target.value) : undefined);
            }} placeholder="Optional VBV ceiling"/>
                        </Field>
                      </div>

                      <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                        <Field label="GOP (seconds)" error={errors.gopSeconds}>
                          <input_1.Input type="number" min="1" value={(_e = form.gopSeconds) !== null && _e !== void 0 ? _e : ""} onChange={function (event) {
                return setField("gopSeconds", event.target.value ? Number(event.target.value) : undefined);
            }}/>
                        </Field>
                        <Field label="Profile">
                          <input_1.Input value={(_f = form.profile) !== null && _f !== void 0 ? _f : ""} onChange={function (event) { return setField("profile", event.target.value || undefined); }} placeholder="high, main10..."/>
                        </Field>
                        <Field label="Level">
                          <input_1.Input value={(_g = form.level) !== null && _g !== void 0 ? _g : ""} onChange={function (event) { return setField("level", event.target.value || undefined); }} placeholder="4.2, 5.1..."/>
                        </Field>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="HDR mode">
                        <select_1.Select value={form.hdrMode} onValueChange={function (value) {
                setField("hdrMode", value);
                if (value === "none") {
                    setHdrPanelOpen(false);
                }
            }}>
                          <select_1.SelectTrigger>
                            <select_1.SelectValue placeholder="HDR configuration"/>
                          </select_1.SelectTrigger>
                          <select_1.SelectContent>
                            {HDR_OPTIONS.map(function (option) { return (<select_1.SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </select_1.SelectItem>); })}
                          </select_1.SelectContent>
                        </select_1.Select>
                      </Field>
                      <Field label="Upscale" description="AI upscaling before render.">
                        <select_1.Select value={form.upscale} onValueChange={function (value) { return setField("upscale", value); }} disabled={form.outputResolution === "source"}>
                          <select_1.SelectTrigger>
                            <select_1.SelectValue placeholder="Upscale method"/>
                          </select_1.SelectTrigger>
                          <select_1.SelectContent>
                            {UPSCALE_OPTIONS.map(function (option) { return (<select_1.SelectItem key={option.value} value={option.value} disabled={form.outputResolution === "source" && option.value !== "none"}>
                                {option.label}
                              </select_1.SelectItem>); })}
                          </select_1.SelectContent>
                        </select_1.Select>
                      </Field>
                    </div>

                    {form.hdrMode !== "none" ? (<div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <button type="button" className="flex w-full items-center justify-between text-xs text-slate-300" onClick={function () { return setHdrPanelOpen(function (prev) { return !prev; }); }}>
                          <span>HDR metadata</span>
                          <framer_motion_1.motion.span animate={{ rotate: hdrPanelOpen ? 180 : 0 }}>
                            <lucide_react_1.Palette className="h-3.5 w-3.5"/>
                          </framer_motion_1.motion.span>
                        </button>
                        {hdrPanelOpen ? (<framer_motion_1.motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="mt-3 grid gap-3 md:grid-cols-3">
                            <input_1.Input placeholder="Mastering display" value={(_j = (_h = form.hdrMeta) === null || _h === void 0 ? void 0 : _h.masteringDisplay) !== null && _j !== void 0 ? _j : ""} onChange={function (event) {
                        var _a;
                        return setField("hdrMeta", __assign(__assign({}, ((_a = form.hdrMeta) !== null && _a !== void 0 ? _a : {})), { masteringDisplay: event.target.value }));
                    }}/>
                            <input_1.Input type="number" placeholder="MaxCLL" value={(_l = (_k = form.hdrMeta) === null || _k === void 0 ? void 0 : _k.maxCLL) !== null && _l !== void 0 ? _l : ""} onChange={function (event) {
                        var _a;
                        return setField("hdrMeta", __assign(__assign({}, ((_a = form.hdrMeta) !== null && _a !== void 0 ? _a : {})), { maxCLL: event.target.value ? Number(event.target.value) : undefined }));
                    }}/>
                            <input_1.Input type="number" placeholder="MaxFALL" value={(_o = (_m = form.hdrMeta) === null || _m === void 0 ? void 0 : _m.maxFALL) !== null && _o !== void 0 ? _o : ""} onChange={function (event) {
                        var _a;
                        return setField("hdrMeta", __assign(__assign({}, ((_a = form.hdrMeta) !== null && _a !== void 0 ? _a : {})), { maxFALL: event.target.value ? Number(event.target.value) : undefined }));
                    }}/>
                          </framer_motion_1.motion.div>) : null}
                      </div>) : null}

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Color space">
                        <select_1.Select value={form.colorSpace} onValueChange={function (value) { return setField("colorSpace", value); }}>
                          <select_1.SelectTrigger>
                            <select_1.SelectValue placeholder="Colour primaries"/>
                          </select_1.SelectTrigger>
                          <select_1.SelectContent>
                            {COLOR_SPACE_OPTIONS.map(function (option) { return (<select_1.SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </select_1.SelectItem>); })}
                          </select_1.SelectContent>
                        </select_1.Select>
                      </Field>
                      <Field label="Transfer curve">
                        <select_1.Select value={form.transfer} onValueChange={function (value) { return setField("transfer", value); }}>
                          <select_1.SelectTrigger>
                            <select_1.SelectValue placeholder="Transfer function"/>
                          </select_1.SelectTrigger>
                          <select_1.SelectContent>
                            {TRANSFER_OPTIONS.map(function (option) { return (<select_1.SelectItem key={option.value} value={option.value}>
                                {option.label.toUpperCase()}
                              </select_1.SelectItem>); })}
                          </select_1.SelectContent>
                        </select_1.Select>
                      </Field>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Tone mapping">
                        <select_1.Select value={form.toneMap} onValueChange={function (value) { return setField("toneMap", value); }}>
                          <select_1.SelectTrigger>
                            <select_1.SelectValue placeholder="Tone map operator"/>
                          </select_1.SelectTrigger>
                          <select_1.SelectContent>
                            {TONE_MAP_OPTIONS.map(function (option) { return (<select_1.SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </select_1.SelectItem>); })}
                          </select_1.SelectContent>
                        </select_1.Select>
                      </Field>
                      <Field label="Look-up table (LUT)">
                        <div className="space-y-2">
                          <select_1.Select value={(_q = (_p = form.lut) === null || _p === void 0 ? void 0 : _p.name) !== null && _q !== void 0 ? _q : "none"} onValueChange={function (value) {
                if (value === "none") {
                    setField("lut", undefined);
                    return;
                }
                var preset = LUT_PRESETS.find(function (item) { return item.value === value; });
                if (preset) {
                    setField("lut", {
                        name: preset.value,
                        type: "cube",
                        url: "/luts/".concat(preset.value),
                    });
                }
            }}>
                            <select_1.SelectTrigger>
                              <select_1.SelectValue placeholder="Choose LUT preset"/>
                            </select_1.SelectTrigger>
                            <select_1.SelectContent>
                              {LUT_PRESETS.map(function (option) { return (<select_1.SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </select_1.SelectItem>); })}
                            </select_1.SelectContent>
                          </select_1.Select>
                          <div className="flex items-center gap-2">
                            <input_1.Input placeholder="Custom LUT URL (.cube)" defaultValue={(_s = (_r = form.lut) === null || _r === void 0 ? void 0 : _r.url) !== null && _s !== void 0 ? _s : ""} onBlur={handleLutChange}/>
                            <button_1.Button type="button" variant="ghost" size="sm">
                              <lucide_react_1.Upload className="mr-1.5 h-3.5 w-3.5"/>
                              Link
                            </button_1.Button>
                          </div>
                        </div>
                      </Field>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Denoise" description="Reduce grain or sensor noise.">
                        <select_1.Select value={form.denoise} onValueChange={function (value) { return setField("denoise", value); }}>
                          <select_1.SelectTrigger>
                            <select_1.SelectValue placeholder="Select denoise"/>
                          </select_1.SelectTrigger>
                          <select_1.SelectContent>
                            {DENOISE_OPTIONS.map(function (option) { return (<select_1.SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </select_1.SelectItem>); })}
                          </select_1.SelectContent>
                        </select_1.Select>
                      </Field>
                      <Field label="Audio codec">
                        <select_1.Select value={form.audioCodec} onValueChange={function (value) { return setField("audioCodec", value); }}>
                          <select_1.SelectTrigger>
                            <select_1.SelectValue placeholder="Select audio codec"/>
                          </select_1.SelectTrigger>
                          <select_1.SelectContent>
                            {AUDIO_CODEC_OPTIONS.map(function (option) { return (<select_1.SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </select_1.SelectItem>); })}
                          </select_1.SelectContent>
                        </select_1.Select>
                      </Field>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Audio channels">
                        <select_1.Select value={form.audioChannels} onValueChange={function (value) { return setField("audioChannels", value); }}>
                          <select_1.SelectTrigger>
                            <select_1.SelectValue placeholder="Channels"/>
                          </select_1.SelectTrigger>
                          <select_1.SelectContent>
                            {AUDIO_CHANNEL_OPTIONS.map(function (option) { return (<select_1.SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </select_1.SelectItem>); })}
                          </select_1.SelectContent>
                        </select_1.Select>
                      </Field>
                      <Field label="Sample rate">
                        <select_1.Select value={String(form.audioSampleRate)} onValueChange={function (value) {
                return setField("audioSampleRate", Number(value));
            }}>
                          <select_1.SelectTrigger>
                            <select_1.SelectValue placeholder="Sample rate"/>
                          </select_1.SelectTrigger>
                          <select_1.SelectContent>
                            {AUDIO_SAMPLE_OPTIONS.map(function (option) { return (<select_1.SelectItem key={option.value} value={String(option.value)}>
                                {option.label}
                              </select_1.SelectItem>); })}
                          </select_1.SelectContent>
                        </select_1.Select>
                      </Field>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Audio loudness">
                        <select_1.Select value={form.audioLoudness} onValueChange={function (value) { return setField("audioLoudness", value); }}>
                          <select_1.SelectTrigger>
                            <select_1.SelectValue placeholder="Loudness"/>
                          </select_1.SelectTrigger>
                          <select_1.SelectContent>
                            {AUDIO_LOUDNESS_OPTIONS.map(function (option) { return (<select_1.SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </select_1.SelectItem>); })}
                          </select_1.SelectContent>
                        </select_1.Select>
                      </Field>
                      <Field label="Dialogue enhance">
                        <select_1.Select value={form.dialogueEnhance} onValueChange={function (value) {
                return setField("dialogueEnhance", value);
            }}>
                          <select_1.SelectTrigger>
                            <select_1.SelectValue placeholder="Dialogue enhancement"/>
                          </select_1.SelectTrigger>
                          <select_1.SelectContent>
                            {DIALOGUE_ENHANCE_OPTIONS.map(function (option) { return (<select_1.SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </select_1.SelectItem>); })}
                          </select_1.SelectContent>
                        </select_1.Select>
                      </Field>
                    </div>
                  </framer_motion_1.motion.div>) : null}

                {form.deliveryMode === "ladder" && form.ladderProfile ? (<div className="space-y-3 rounded-2xl border border-cyan-400/30 bg-cyan-500/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-white">
                        Bitrate ladder
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <select_1.Select value={ladderPresetId} onValueChange={handleLadderPreset}>
                          <select_1.SelectTrigger className="w-40">
                            <select_1.SelectValue placeholder="Preset"/>
                          </select_1.SelectTrigger>
                          <select_1.SelectContent>
                            {ladder_1.LADDER_PRESETS.map(function (preset) { return (<select_1.SelectItem key={preset.name} value={preset.name}>
                                {preset.name}
                              </select_1.SelectItem>); })}
                          </select_1.SelectContent>
                        </select_1.Select>
                        <button_1.Button variant="secondary" size="sm" onClick={exportLadder}>
                          <lucide_react_1.Download className="mr-1.5 h-3.5 w-3.5"/>
                          Export
                        </button_1.Button>
                        <button_1.Button variant="secondary" size="sm" onClick={importLadder}>
                          <lucide_react_1.Upload className="mr-1.5 h-3.5 w-3.5"/>
                          Import
                        </button_1.Button>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      {form.ladderProfile.steps.map(function (step, index) { return (<LadderStepRow key={"".concat(step.res, "-").concat(index)} index={index} res={step.res} bitrate={step.bitrateKbps} maxrate={step.maxrateKbps} onChange={function (part) { return updateLadderStep(index, part); }} onRemove={function () { return removeLadderStep(index); }}/>); })}
                    </div>
                    <button_1.Button variant="outline" size="sm" onClick={addLadderStep}>
                      Add rung
                    </button_1.Button>
                  </div>) : null}
              </tabs_1.TabsContent>
            </tabs_1.Tabs>
            {warnings.length ? (<div className="mt-6 space-y-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-xs text-amber-200">
                <div className="flex items-center gap-2 text-amber-300">
                  <lucide_react_1.AlertTriangle className="h-4 w-4"/>
                  Warnings
                </div>
                <ul className="space-y-1">
                  {warnings.map(function (warning) { return (<li key={warning}>- {warning}</li>); })}
                </ul>
              </div>) : null}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-slate-200">
                <lucide_react_1.Info className="h-4 w-4 text-cyan-300"/>
                Estimated duration: {durationMinutes.toFixed(2)} minutes
              </div>
              <div className="flex flex-wrap gap-3">
                <button_1.Button variant="secondary" className="rounded-2xl" onClick={function () { return setTemplateDialogOpen(true); }}>
                  Manage templates
                </button_1.Button>
                <button_1.Button className="rounded-2xl bg-cyan-400 text-slate-950 shadow-[0_0_32px_rgba(14,165,233,0.6)] hover:bg-cyan-300" onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? (<lucide_react_1.Loader2 className="mr-2 h-4 w-4 animate-spin"/>) : (<lucide_react_1.CheckCircle2 className="mr-2 h-4 w-4"/>)}
                  Queue task
                </button_1.Button>
              </div>
            </div>
          </card_1.CardContent>
        </card_1.Card>

        <div className="space-y-6">
          <card_1.Card className="bg-white/5 backdrop-blur-xl">
            <card_1.CardHeader>
              <card_1.CardTitle className="flex items-center gap-2 text-base">
                <lucide_react_1.Palette className="h-4 w-4 text-cyan-300"/>
                Render estimation
              </card_1.CardTitle>
              <card_1.CardDescription>
                Preview the expected encoding profile, duration, and approximate file size.
              </card_1.CardDescription>
            </card_1.CardHeader>
            <card_1.CardContent className="space-y-3 text-sm text-slate-200">
              <div className="flex items-center justify-between">
                <span>Output resolution</span>
                <span>{form.outputResolution}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Analysis resolution</span>
                <span>{form.analysisResolution}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Encoder</span>
                <span>{(0, utils_1.prettyCodec)(form.encoder)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Container</span>
                <span>{(0, utils_1.prettyContainer)(form.container)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Encoder preset</span>
                <span>{((_t = form.encoderPreset) !== null && _t !== void 0 ? _t : "medium").toUpperCase()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Color / transfer</span>
                <span>
                  {form.colorSpace.toUpperCase()} / {form.transfer.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Target bitrate</span>
                <span>{(0, utils_1.formatBitrate)(resolvedBitrate)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Estimated duration</span>
                <span>{durationMinutes.toFixed(2)} minutes</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Estimated render time</span>
                <span>{renderTimeFormatted}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Estimated size</span>
                <span>{estimatedSizeMB.toFixed(1)} MB</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Estimated VRAM</span>
                <span>{estimatedVRAM} MB</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Segments planned</span>
                <span>
                  {splitPlanInfo.segments} x {form.maxSegmentDuration}m (last {splitPlanInfo.lastSegmentMinutes.toFixed(1)}m)
                </span>
              </div>
              {performanceNotes.length ? (<div className="rounded-xl border border-white/10 bg-slate-900/50 p-3 text-xs text-slate-300">
                  <p className="mb-1 font-medium text-slate-200">Performance notes</p>
                  <ul className="space-y-1">
                    {performanceNotes.map(function (note) { return (<li key={note}>- {note}</li>); })}
                  </ul>
                </div>) : null}
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                Recommended bitrate range for {form.outputResolution.toUpperCase()}: {(0, utils_1.formatBitrate)(recommendedBitrate.min)} - {(0, utils_1.formatBitrate)(recommendedBitrate.max)} (target {(0, utils_1.formatBitrate)(recommendedBitrate.target)}).
              </div>
            </card_1.CardContent>
          </card_1.Card>
          <card_1.Card className="bg-white/5 backdrop-blur-xl">
            <card_1.CardHeader>
              <card_1.CardTitle className="flex items-center gap-2 text-base">
                Recent submissions
              </card_1.CardTitle>
              <card_1.CardDescription>Local history of the last 5 workflow requests.</card_1.CardDescription>
            </card_1.CardHeader>
            <card_1.CardContent className="space-y-3 text-sm text-slate-200">
              {tasks.slice(0, 5).map(function (task) { return (<div key={task.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/50 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-white">{task.label}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(task.submittedAt).toLocaleTimeString()} - est. {task.estimateMinutes.toFixed(2)} mins - {task.estimateSizeMB.toFixed(1)} MB
                    </p>
                  </div>
                  <badge_1.Badge variant="secondary" className="text-xs">
                    {task.payload.outputResolution.toUpperCase()}
                  </badge_1.Badge>
                </div>); })}
              {!tasks.length ? (<p className="text-xs text-slate-400">Submit a task to populate history.</p>) : null}
            </card_1.CardContent>
          </card_1.Card>
        </div>
      </div>
    </>
  );
}

export default AiWorkflowPage;


    </>);
}
