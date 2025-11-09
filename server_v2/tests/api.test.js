"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
var vitest_1 = require("vitest");
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var helpers_js_1 = require("./helpers.js");
var prisma_js_1 = require("../src/db/prisma.js");
var webhook_js_1 = require("../src/routes/webhook.js");
var artifacts_js_1 = require("../src/tasks/artifacts.js");
var uri_js_1 = require("../src/storage/uri.js");
var flags_js_1 = require("../src/services/flags.js");
var orchestrator_js_1 = require("../src/gen/orchestrator.js");
var effects_js_1 = require("../src/gen/effects.js");
var env_js_1 = require("../src/utils/env.js");
process.env.GEN_MOCK_MIN_MS = '200';
process.env.GEN_MOCK_MAX_MS = '400';
var password = 'Passw0rd!123!';
var originalGenMinuteLimit = env_js_1.env.GEN_QUOTA_MIN_PER_DAY;
var originalGenConcurrency = env_js_1.env.GEN_QUOTA_CONCURRENCY;
(0, vitest_1.afterEach)(function () {
    env_js_1.env.GEN_QUOTA_MIN_PER_DAY = originalGenMinuteLimit;
    env_js_1.env.GEN_QUOTA_CONCURRENCY = originalGenConcurrency;
});
var registerAndAuth = function (email) { return __awaiter(void 0, void 0, void 0, function () {
    var api, response, token, orgId;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                api = (0, helpers_js_1.agent)();
                return [4 /*yield*/, api.post('/v1/auth/register').send({ email: email, password: password })];
            case 1:
                response = _a.sent();
                (0, vitest_1.expect)(response.status).toBe(201);
                token = response.body.token;
                orgId = response.body.organizations[0].organizationId;
                return [2 /*return*/, { api: api, token: token, orgId: orgId }];
        }
    });
}); };
var authHeaders = function (token, orgId) { return ({
    Authorization: "Bearer ".concat(token),
    'X-Org-Id': orgId
}); };
(0, vitest_1.describe)('API contracts', function () {
    (0, vitest_1.beforeEach)(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, helpers_js_1.resetDatabase)()];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.afterAll)(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, prisma_js_1.prisma.$disconnect()];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('registers user and creates task via /v1 routes', function () { return __awaiter(void 0, void 0, void 0, function () {
        var email, _a, api, token, orgId, createRes, listRes;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    email = "test+".concat(Date.now(), "@codex.local");
                    return [4 /*yield*/, registerAndAuth(email)];
                case 1:
                    _a = _c.sent(), api = _a.api, token = _a.token, orgId = _a.orgId;
                    return [4 /*yield*/, api
                            .post('/v1/tasks')
                            .set(authHeaders(token, orgId))
                            .send({
                            title: 'Unit subtitle',
                            params: { kind: 'subtitle', language: 'en-US', inputAudio: './sample.wav' }
                        })];
                case 2:
                    createRes = _c.sent();
                    (0, vitest_1.expect)(createRes.status).toBe(201);
                    return [4 /*yield*/, api.get('/v1/tasks').set(authHeaders(token, orgId))];
                case 3:
                    listRes = _c.sent();
                    (0, vitest_1.expect)(listRes.status).toBe(200);
                    (0, vitest_1.expect)((_b = listRes.body.items) !== null && _b !== void 0 ? _b : []).toHaveLength(1);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('denies viewer access to admin resources', function () { return __awaiter(void 0, void 0, void 0, function () {
        var email, _a, api, token, orgId, adminRes;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    email = "viewer+".concat(Date.now(), "@codex.local");
                    return [4 /*yield*/, registerAndAuth(email)];
                case 1:
                    _a = _b.sent(), api = _a.api, token = _a.token, orgId = _a.orgId;
                    return [4 /*yield*/, prisma_js_1.prisma.membership.updateMany({
                            where: { organizationId: orgId },
                            data: { role: 'VIEWER' }
                        })];
                case 2:
                    _b.sent();
                    return [4 /*yield*/, api.get('/v1/admin/deadletters').set(authHeaders(token, orgId))];
                case 3:
                    adminRes = _b.sent();
                    (0, vitest_1.expect)(adminRes.status).toBe(403);
                    (0, vitest_1.expect)(adminRes.body.error.code).toBe('ERR_AUTH');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('expands pipeline templates atomically', function () { return __awaiter(void 0, void 0, void 0, function () {
        var email, _a, api, token, orgId, template, response, burnStage, subStage, burnTask, deps;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    email = "pipeline+".concat(Date.now(), "@codex.local");
                    return [4 /*yield*/, registerAndAuth(email)];
                case 1:
                    _a = _c.sent(), api = _a.api, token = _a.token, orgId = _a.orgId;
                    template = {
                        stages: [
                            {
                                id: 'sub',
                                title: 'Sub stage',
                                params: { kind: 'subtitle', language: 'en-US', inputAudio: './a.wav' }
                            },
                            {
                                id: 'burn',
                                title: 'Burn stage',
                                dependsOn: ['sub'],
                                params: {
                                    kind: 'burn',
                                    inputVideo: './video.mp4',
                                    inputSubtitle: { from: 'sub', artifact: 'srt' }
                                }
                            }
                        ]
                    };
                    return [4 /*yield*/, api
                            .post('/v1/pipeline/run')
                            .set(authHeaders(token, orgId))
                            .send(template)];
                case 2:
                    response = _c.sent();
                    (0, vitest_1.expect)(response.status).toBe(200);
                    (0, vitest_1.expect)(response.body.created).toHaveLength(2);
                    burnStage = response.body.created.find(function (item) { return item.stageId === 'burn'; });
                    subStage = response.body.created.find(function (item) { return item.stageId === 'sub'; });
                    (0, vitest_1.expect)(burnStage).toBeDefined();
                    (0, vitest_1.expect)(subStage).toBeDefined();
                    return [4 /*yield*/, prisma_js_1.prisma.task.findUniqueOrThrow({ where: { id: burnStage.taskId } })];
                case 3:
                    burnTask = _c.sent();
                    deps = JSON.parse((_b = burnTask.dependsOn) !== null && _b !== void 0 ? _b : '[]');
                    (0, vitest_1.expect)(deps).toContain(subStage.taskId);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('produces deterministic webhook signatures', function () {
        var payload = JSON.stringify({ id: 'task123', status: 'success' });
        var signatureA = (0, webhook_js_1.signPayload)(payload);
        var signatureB = (0, webhook_js_1.signPayload)(payload);
        (0, vitest_1.expect)(signatureA).toBe(signatureB);
    });
    (0, vitest_1.it)('supports overriding webhook secret when signing payloads', function () {
        var payload = JSON.stringify({ id: 'task123', status: 'success' });
        var defaultSignature = (0, webhook_js_1.signPayload)(payload);
        var customSignature = (0, webhook_js_1.signPayload)(payload, 'custom-secret');
        (0, vitest_1.expect)(customSignature).not.toBe(defaultSignature);
    });
    (0, vitest_1.it)('allows admins to manage feature flags with org overrides', function () { return __awaiter(void 0, void 0, void 0, function () {
        var email, _a, api, token, orgId, headers, createRes, listRes, overrideRes, resolved;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    email = "flags+".concat(Date.now(), "@codex.local");
                    return [4 /*yield*/, registerAndAuth(email)];
                case 1:
                    _a = _b.sent(), api = _a.api, token = _a.token, orgId = _a.orgId;
                    headers = authHeaders(token, orgId);
                    return [4 /*yield*/, api
                            .post('/v1/admin/flags')
                            .set(headers)
                            .send({ key: 'publish.dry_run', defaultValue: true })];
                case 2:
                    createRes = _b.sent();
                    (0, vitest_1.expect)([200, 201]).toContain(createRes.status);
                    return [4 /*yield*/, api.get('/v1/admin/flags').set(headers)];
                case 3:
                    listRes = _b.sent();
                    (0, vitest_1.expect)(listRes.status).toBe(200);
                    (0, vitest_1.expect)(Array.isArray(listRes.body.items)).toBe(true);
                    (0, vitest_1.expect)(listRes.body.items.find(function (flag) { return flag.key === 'publish.dry_run'; })).toBeTruthy();
                    return [4 /*yield*/, api
                            .post('/v1/admin/flags/publish.dry_run/overrides')
                            .set(headers)
                            .send({ orgId: orgId, value: false })];
                case 4:
                    overrideRes = _b.sent();
                    (0, vitest_1.expect)(overrideRes.status).toBe(200);
                    return [4 /*yield*/, (0, flags_js_1.getFlag)('publish.dry_run', orgId, true)];
                case 5:
                    resolved = _b.sent();
                    (0, vitest_1.expect)(resolved).toBe(false);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('reports usage snapshot via billing route', function () { return __awaiter(void 0, void 0, void 0, function () {
        var email, _a, api, token, orgId, usageRes;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    email = "billing+".concat(Date.now(), "@codex.local");
                    return [4 /*yield*/, registerAndAuth(email)];
                case 1:
                    _a = _b.sent(), api = _a.api, token = _a.token, orgId = _a.orgId;
                    return [4 /*yield*/, api
                            .post('/v1/tasks')
                            .set(authHeaders(token, orgId))
                            .send({
                            title: 'Usage sample',
                            params: { kind: 'subtitle', language: 'en-US', inputAudio: './sample.wav' }
                        })];
                case 2:
                    _b.sent();
                    return [4 /*yield*/, api.get('/v1/billing/usage').set(authHeaders(token, orgId))];
                case 3:
                    usageRes = _b.sent();
                    (0, vitest_1.expect)(usageRes.status).toBe(200);
                    (0, vitest_1.expect)(usageRes.body.tasks.used).toBeGreaterThanOrEqual(1);
                    (0, vitest_1.expect)(usageRes.body.tasks.limit).toBeGreaterThan(0);
                    (0, vitest_1.expect)(usageRes.body.renderMinutes.used).toBe(0);
                    (0, vitest_1.expect)(usageRes.body.storage.limitBytes).toBeGreaterThan(0);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('rejects presign requests when S3 backend is disabled', function () { return __awaiter(void 0, void 0, void 0, function () {
        var email, _a, api, token, orgId, res;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    email = "presign+".concat(Date.now(), "@codex.local");
                    return [4 /*yield*/, registerAndAuth(email)];
                case 1:
                    _a = _b.sent(), api = _a.api, token = _a.token, orgId = _a.orgId;
                    return [4 /*yield*/, api
                            .post('/v1/uploads/presign')
                            .set(authHeaders(token, orgId))
                            .send({ filename: 'demo.wav', contentType: 'audio/wav', size: 1024 })];
                case 2:
                    res = _b.sent();
                    (0, vitest_1.expect)(res.status).toBe(400);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('streams artifacts via /files route', function () { return __awaiter(void 0, void 0, void 0, function () {
        var email, _a, api, token, orgId, createRes, taskId, workspace, artifactPath, storagePath, downloadRes;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    email = "files+".concat(Date.now(), "@codex.local");
                    return [4 /*yield*/, registerAndAuth(email)];
                case 1:
                    _a = _b.sent(), api = _a.api, token = _a.token, orgId = _a.orgId;
                    return [4 /*yield*/, api
                            .post('/v1/tasks')
                            .set(authHeaders(token, orgId))
                            .send({
                            title: 'Download me',
                            params: { kind: 'subtitle', language: 'en-US', inputAudio: './sample.wav' }
                        })];
                case 2:
                    createRes = _b.sent();
                    (0, vitest_1.expect)(createRes.status).toBe(201);
                    taskId = createRes.body.id;
                    return [4 /*yield*/, (0, artifacts_js_1.ensureTaskDir)(taskId)];
                case 3:
                    workspace = _b.sent();
                    artifactPath = (0, node_path_1.join)(workspace, 'artifact.txt');
                    return [4 /*yield*/, node_fs_1.promises.writeFile(artifactPath, 'hello-download')];
                case 4:
                    _b.sent();
                    storagePath = (0, uri_js_1.absoluteToStorageUri)(artifactPath);
                    return [4 /*yield*/, (0, artifacts_js_1.saveArtifacts)(taskId, {
                            artifacts: {
                                sample: {
                                    name: 'sample',
                                    path: storagePath,
                                    type: 'text/plain',
                                    size: 'hello-download'.length,
                                    createdAt: new Date().toISOString(),
                                    metadata: {}
                                }
                            }
                        })];
                case 5:
                    _b.sent();
                    return [4 /*yield*/, api
                            .get("/v1/files/".concat(taskId, "/sample"))
                            .set(authHeaders(token, orgId))];
                case 6:
                    downloadRes = _b.sent();
                    (0, vitest_1.expect)(downloadRes.status).toBe(200);
                    (0, vitest_1.expect)(downloadRes.text).toBe('hello-download');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('runs gen_video pipeline via mock adapter', function () { return __awaiter(void 0, void 0, void 0, function () {
        var email, _a, api, token, orgId, createRes, task, params, generation, workspace, assets, events, artifactState;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    email = "gen+".concat(Date.now(), "@codex.local");
                    return [4 /*yield*/, registerAndAuth(email)];
                case 1:
                    _a = _c.sent(), api = _a.api, token = _a.token, orgId = _a.orgId;
                    return [4 /*yield*/, api
                            .post('/v1/tasks')
                            .set(authHeaders(token, orgId))
                            .send({
                            title: 'Gen video test',
                            params: {
                                kind: 'gen_video',
                                prompt: 'A cinematic shot of a neon skyline reflecting on water',
                                duration: 10,
                                resolution: '1080p',
                                aspect: '16:9',
                                providerPolicy: 'force:mock'
                            }
                        })];
                case 2:
                    createRes = _c.sent();
                    (0, vitest_1.expect)(createRes.status).toBe(201);
                    return [4 /*yield*/, prisma_js_1.prisma.task.findUniqueOrThrow({ where: { id: createRes.body.id } })];
                case 3:
                    task = _c.sent();
                    params = JSON.parse((_b = task.params) !== null && _b !== void 0 ? _b : '{}');
                    return [4 /*yield*/, (0, orchestrator_js_1.runGenVideo)({
                            id: task.id,
                            organizationId: task.organizationId,
                            params: params
                        })];
                case 4:
                    _c.sent();
                    return [4 /*yield*/, prisma_js_1.prisma.generation.findUnique({ where: { taskId: task.id } })];
                case 5:
                    generation = _c.sent();
                    (0, vitest_1.expect)(generation).not.toBeNull();
                    return [4 /*yield*/, (0, artifacts_js_1.ensureTaskDir)(task.id)];
                case 6:
                    workspace = _c.sent();
                    return [4 /*yield*/, (0, vitest_1.expect)(node_fs_1.promises.stat((0, node_path_1.join)(workspace, 'primary.mp4'))).resolves.toBeTruthy()];
                case 7:
                    _c.sent();
                    return [4 /*yield*/, (0, vitest_1.expect)(node_fs_1.promises.stat((0, node_path_1.join)(workspace, 'preview.mp4'))).resolves.toBeTruthy()];
                case 8:
                    _c.sent();
                    return [4 /*yield*/, (0, vitest_1.expect)(node_fs_1.promises.stat((0, node_path_1.join)(workspace, 'cover.jpg'))).resolves.toBeTruthy()];
                case 9:
                    _c.sent();
                    return [4 /*yield*/, (0, vitest_1.expect)(node_fs_1.promises.stat((0, node_path_1.join)(workspace, 'metadata.json'))).resolves.toBeTruthy()];
                case 10:
                    _c.sent();
                    return [4 /*yield*/, prisma_js_1.prisma.generationAsset.findMany({ where: { generationId: generation.id } })];
                case 11:
                    assets = _c.sent();
                    (0, vitest_1.expect)(assets.length).toBeGreaterThanOrEqual(4);
                    return [4 /*yield*/, prisma_js_1.prisma.generationEvent.findMany({ where: { generationId: generation.id } })];
                case 12:
                    events = _c.sent();
                    (0, vitest_1.expect)(events.length).toBeGreaterThanOrEqual(4);
                    return [4 /*yield*/, (0, artifacts_js_1.loadArtifacts)(task.id)];
                case 13:
                    artifactState = _c.sent();
                    (0, vitest_1.expect)(Object.keys(artifactState.artifacts)).toEqual(vitest_1.expect.arrayContaining(['primary', 'preview', 'cover', 'metadata']));
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('reports generation billing usage snapshot', function () { return __awaiter(void 0, void 0, void 0, function () {
        var email, _a, api, token, orgId, createRes, task, generation, usageRes;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    email = "billing+".concat(Date.now(), "@codex.local");
                    return [4 /*yield*/, registerAndAuth(email)];
                case 1:
                    _a = _c.sent(), api = _a.api, token = _a.token, orgId = _a.orgId;
                    return [4 /*yield*/, api
                            .post('/v1/tasks')
                            .set(authHeaders(token, orgId))
                            .send({
                            title: 'Gen for billing',
                            params: {
                                kind: 'gen_video',
                                prompt: 'A serene mountain lake at sunrise',
                                duration: 12,
                                resolution: '1080p',
                                aspect: '16:9',
                                providerPolicy: 'force:mock'
                            }
                        })];
                case 2:
                    createRes = _c.sent();
                    (0, vitest_1.expect)(createRes.status).toBe(201);
                    return [4 /*yield*/, prisma_js_1.prisma.task.findUniqueOrThrow({ where: { id: createRes.body.id } })];
                case 3:
                    task = _c.sent();
                    return [4 /*yield*/, (0, orchestrator_js_1.runGenVideo)({
                            id: task.id,
                            organizationId: task.organizationId,
                            params: JSON.parse((_b = task.params) !== null && _b !== void 0 ? _b : '{}')
                        })];
                case 4:
                    _c.sent();
                    return [4 /*yield*/, prisma_js_1.prisma.generation.findUniqueOrThrow({ where: { taskId: task.id } })];
                case 5:
                    generation = _c.sent();
                    (0, vitest_1.expect)(generation.billedMinutes).toBeGreaterThan(0);
                    return [4 /*yield*/, api.get('/v1/billing/usage').set(authHeaders(token, orgId))];
                case 6:
                    usageRes = _c.sent();
                    (0, vitest_1.expect)(usageRes.status).toBe(200);
                    (0, vitest_1.expect)(usageRes.body.generations.minutesUsed).toBeGreaterThanOrEqual(generation.billedMinutes);
                    (0, vitest_1.expect)(usageRes.body.generations.limit).toBe(env_js_1.env.GEN_QUOTA_MIN_PER_DAY);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('enforces generation minute quota per org', function () { return __awaiter(void 0, void 0, void 0, function () {
        var email, _a, token, orgId, api, makeTask, firstTask, secondTask, quotaGen, quotaAudit;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    env_js_1.env.GEN_QUOTA_MIN_PER_DAY = 1;
                    email = "quota+".concat(Date.now(), "@codex.local");
                    return [4 /*yield*/, registerAndAuth(email)];
                case 1:
                    _a = _d.sent(), token = _a.token, orgId = _a.orgId;
                    api = (0, helpers_js_1.agent)();
                    makeTask = function () { return __awaiter(void 0, void 0, void 0, function () {
                        var createRes;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, api
                                        .post('/v1/tasks')
                                        .set(authHeaders(token, orgId))
                                        .send({
                                        title: 'Quota task',
                                        params: {
                                            kind: 'gen_video',
                                            prompt: "Quota run ".concat(Date.now()),
                                            duration: 60,
                                            resolution: '1080p',
                                            aspect: '16:9',
                                            providerPolicy: 'force:mock'
                                        }
                                    })];
                                case 1:
                                    createRes = _a.sent();
                                    (0, vitest_1.expect)(createRes.status).toBe(201);
                                    return [2 /*return*/, prisma_js_1.prisma.task.findUniqueOrThrow({ where: { id: createRes.body.id } })];
                            }
                        });
                    }); };
                    return [4 /*yield*/, makeTask()];
                case 2:
                    firstTask = _d.sent();
                    return [4 /*yield*/, (0, orchestrator_js_1.runGenVideo)({
                            id: firstTask.id,
                            organizationId: firstTask.organizationId,
                            params: JSON.parse((_b = firstTask.params) !== null && _b !== void 0 ? _b : '{}')
                        })];
                case 3:
                    _d.sent();
                    return [4 /*yield*/, makeTask()];
                case 4:
                    secondTask = _d.sent();
                    return [4 /*yield*/, (0, vitest_1.expect)((0, orchestrator_js_1.runGenVideo)({
                            id: secondTask.id,
                            organizationId: secondTask.organizationId,
                            params: JSON.parse((_c = secondTask.params) !== null && _c !== void 0 ? _c : '{}')
                        })).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' })];
                case 5:
                    _d.sent();
                    return [4 /*yield*/, prisma_js_1.prisma.generation.findUnique({ where: { taskId: secondTask.id } })];
                case 6:
                    quotaGen = _d.sent();
                    (0, vitest_1.expect)(quotaGen === null || quotaGen === void 0 ? void 0 : quotaGen.status).toBe('rejected_quota');
                    return [4 /*yield*/, prisma_js_1.prisma.generationAudit.findMany({
                            where: { organizationId: orgId, event: 'quota.minutes' }
                        })];
                case 7:
                    quotaAudit = _d.sent();
                    (0, vitest_1.expect)(quotaAudit.length).toBeGreaterThanOrEqual(1);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('blocks generation when concurrency cap is reached', function () { return __awaiter(void 0, void 0, void 0, function () {
        var email, _a, token, orgId, api, blockingTask, createRes, nextTask, audit;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    env_js_1.env.GEN_QUOTA_CONCURRENCY = 1;
                    email = "concurrency+".concat(Date.now(), "@codex.local");
                    return [4 /*yield*/, registerAndAuth(email)];
                case 1:
                    _a = _c.sent(), token = _a.token, orgId = _a.orgId;
                    api = (0, helpers_js_1.agent)();
                    return [4 /*yield*/, prisma_js_1.prisma.task.create({
                            data: {
                                organizationId: orgId,
                                title: 'Blocking generation',
                                params: JSON.stringify({ kind: 'gen_video' }),
                                status: 'running'
                            }
                        })];
                case 2:
                    blockingTask = _c.sent();
                    return [4 /*yield*/, prisma_js_1.prisma.generation.create({
                            data: {
                                taskId: blockingTask.id,
                                organizationId: orgId,
                                tenantId: orgId,
                                provider: 'mock',
                                policy: 'force:mock',
                                status: 'running',
                                prompt: 'Blocking prompt',
                                durationSec: 10,
                                resolution: '1080p',
                                fps: 24,
                                aspectRatio: '16:9',
                                seed: null,
                                estimatedMinutes: 1,
                                pricePerMinCents: 0
                            }
                        })];
                case 3:
                    _c.sent();
                    return [4 /*yield*/, api
                            .post('/v1/tasks')
                            .set(authHeaders(token, orgId))
                            .send({
                            title: 'Gen blocked',
                            params: {
                                kind: 'gen_video',
                                prompt: 'Attempt while capped',
                                duration: 10,
                                resolution: '1080p',
                                aspect: '16:9',
                                providerPolicy: 'force:mock'
                            }
                        })];
                case 4:
                    createRes = _c.sent();
                    (0, vitest_1.expect)(createRes.status).toBe(201);
                    return [4 /*yield*/, prisma_js_1.prisma.task.findUniqueOrThrow({ where: { id: createRes.body.id } })];
                case 5:
                    nextTask = _c.sent();
                    return [4 /*yield*/, (0, vitest_1.expect)((0, orchestrator_js_1.runGenVideo)({
                            id: nextTask.id,
                            organizationId: nextTask.organizationId,
                            params: JSON.parse((_b = nextTask.params) !== null && _b !== void 0 ? _b : '{}')
                        })).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' })];
                case 6:
                    _c.sent();
                    return [4 /*yield*/, prisma_js_1.prisma.generationAudit.findFirst({
                            where: { organizationId: orgId, event: 'quota.concurrency' }
                        })];
                case 7:
                    audit = _c.sent();
                    (0, vitest_1.expect)(audit).not.toBeNull();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('rejects youtube publish jobs when license forbids commercial use', function () { return __awaiter(void 0, void 0, void 0, function () {
        var email, _a, api, token, orgId, binding, createRes, params, response, audits;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    email = "license-block+".concat(Date.now(), "@codex.local");
                    return [4 /*yield*/, registerAndAuth(email)];
                case 1:
                    _a = _c.sent(), api = _a.api, token = _a.token, orgId = _a.orgId;
                    return [4 /*yield*/, prisma_js_1.prisma.channelBinding.create({
                            data: {
                                organizationId: orgId,
                                provider: 'youtube',
                                channelId: 'chan_123',
                                channelTitle: 'Test Channel',
                                scopes: JSON.stringify(['youtube.upload']),
                                tokensRef: '{}',
                                status: 'active',
                                notes: null
                            }
                        })];
                case 2:
                    binding = _c.sent();
                    return [4 /*yield*/, prisma_js_1.prisma.task.create({
                            data: {
                                organizationId: orgId,
                                title: 'Gen for publish',
                                params: JSON.stringify({
                                    kind: 'gen_video',
                                    prompt: 'Mock skyline for validation',
                                    duration: 10,
                                    resolution: '1080p',
                                    aspect: '16:9',
                                    providerPolicy: 'force:mock'
                                })
                            }
                        })];
                case 3:
                    createRes = _c.sent();
                    params = JSON.parse((_b = createRes.params) !== null && _b !== void 0 ? _b : '{}');
                    return [4 /*yield*/, (0, orchestrator_js_1.runGenVideo)({
                            id: createRes.id,
                            organizationId: orgId,
                            params: params
                        })];
                case 4:
                    _c.sent();
                    return [4 /*yield*/, api
                            .post('/v1/publish/youtube/schedule')
                            .set(authHeaders(token, orgId))
                            .send({
                            channelBindingId: binding.id,
                            title: 'Blocked publish',
                            scheduledAt: new Date(Date.now() + 60000).toISOString(),
                            artifact: {
                                taskId: createRes.id,
                                artifactName: 'primary'
                            }
                        })];
                case 5:
                    response = _c.sent();
                    (0, vitest_1.expect)(response.status).toBe(409);
                    (0, vitest_1.expect)(response.body.error.code).toBe('GEN_LICENSE_BLOCK');
                    return [4 /*yield*/, prisma_js_1.prisma.auditLog.findMany({
                            where: { organizationId: orgId, action: 'publish.license_block' }
                        })];
                case 6:
                    audits = _c.sent();
                    (0, vitest_1.expect)(audits.length).toBeGreaterThan(0);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('applies domoai gen_effect and writes variant metadata', function () { return __awaiter(void 0, void 0, void 0, function () {
        var email, _a, api, token, orgId, sampleVideoPath, createRes, createdTask, params, variantVideoPath, metadataPath, metadata, _b, _c, artifacts, generation;
        var _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    email = "effect+".concat(Date.now(), "@codex.local");
                    return [4 /*yield*/, registerAndAuth(email)];
                case 1:
                    _a = _f.sent(), api = _a.api, token = _a.token, orgId = _a.orgId;
                    sampleVideoPath = (0, node_path_1.join)(process.cwd(), 'workspace', "effect-input-".concat(Date.now(), ".mp4"));
                    return [4 /*yield*/, node_fs_1.promises.mkdir((0, node_path_1.join)(process.cwd(), 'workspace'), { recursive: true })];
                case 2:
                    _f.sent();
                    return [4 /*yield*/, node_fs_1.promises.writeFile(sampleVideoPath, Buffer.from('fake-video-content'))];
                case 3:
                    _f.sent();
                    return [4 /*yield*/, api
                            .post('/v1/tasks')
                            .set(authHeaders(token, orgId))
                            .send({
                            title: 'Effect zoom',
                            params: {
                                kind: 'gen_effect',
                                effect: 'zoom',
                                inputVideo: sampleVideoPath
                            }
                        })];
                case 4:
                    createRes = _f.sent();
                    (0, vitest_1.expect)(createRes.status).toBe(201);
                    return [4 /*yield*/, prisma_js_1.prisma.task.findUniqueOrThrow({ where: { id: createRes.body.id } })];
                case 5:
                    createdTask = _f.sent();
                    params = JSON.parse((_d = createdTask.params) !== null && _d !== void 0 ? _d : '{}');
                    return [4 /*yield*/, (0, effects_js_1.runGenEffect)({
                            id: createdTask.id,
                            organizationId: createdTask.organizationId,
                            params: params
                        })];
                case 6:
                    _f.sent();
                    variantVideoPath = (0, node_path_1.join)(process.cwd(), 'workspace', createdTask.id, 'variants', 'variant-001', 'primary.mp4');
                    return [4 /*yield*/, (0, vitest_1.expect)(node_fs_1.promises.stat(variantVideoPath)).resolves.toBeTruthy()];
                case 7:
                    _f.sent();
                    metadataPath = (0, node_path_1.join)(process.cwd(), 'workspace', createdTask.id, 'metadata.json');
                    _c = (_b = JSON).parse;
                    return [4 /*yield*/, node_fs_1.promises.readFile(metadataPath, 'utf8')];
                case 8:
                    metadata = _c.apply(_b, [_f.sent()]);
                    (0, vitest_1.expect)(Array.isArray(metadata.variants)).toBe(true);
                    (0, vitest_1.expect)((_e = metadata.variants.at(-1)) === null || _e === void 0 ? void 0 : _e.name).toBe('variant-001');
                    return [4 /*yield*/, (0, artifacts_js_1.loadArtifacts)(createdTask.id)];
                case 9:
                    artifacts = _f.sent();
                    (0, vitest_1.expect)(artifacts.artifacts['variant-001-primary']).toBeDefined();
                    return [4 /*yield*/, prisma_js_1.prisma.generation.findFirst({ where: { taskId: createdTask.id } })];
                case 10:
                    generation = _f.sent();
                    (0, vitest_1.expect)(generation === null || generation === void 0 ? void 0 : generation.provider).toBe('domoai');
                    return [2 /*return*/];
            }
        });
    }); }, 10000);
});
