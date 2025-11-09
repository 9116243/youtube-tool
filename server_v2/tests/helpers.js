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
exports.resetDatabase = exports.agent = exports.createTestApp = void 0;
var express_1 = require("express");
var supertest_1 = require("supertest");
var prisma_js_1 = require("../src/db/prisma.js");
var router_v1_js_1 = require("../src/router.v1.js");
var error_js_1 = require("../src/middleware/error.js");
var request_id_js_1 = require("../src/middleware/request-id.js");
var createTestApp = function () {
    var app = (0, express_1.default)();
    app.use(request_id_js_1.requestContextMiddleware);
    app.use(express_1.default.json({ limit: '2mb' }));
    app.use('/v1', (0, router_v1_js_1.buildV1Router)());
    app.use(error_js_1.errorHandler);
    return app;
};
exports.createTestApp = createTestApp;
var agent = function () { return (0, supertest_1.default)((0, exports.createTestApp)()); };
exports.agent = agent;
var resetDatabase = function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, prisma_js_1.prisma.$transaction([
                    prisma_js_1.prisma.generationAsset.deleteMany(),
                    prisma_js_1.prisma.generationEvent.deleteMany(),
                    prisma_js_1.prisma.generationAudit.deleteMany(),
                    prisma_js_1.prisma.generation.deleteMany(),
                    prisma_js_1.prisma.taskEvent.deleteMany(),
                    prisma_js_1.prisma.auditLog.deleteMany(),
                    prisma_js_1.prisma.upload.deleteMany(),
                    prisma_js_1.prisma.publishJob.deleteMany(),
                    prisma_js_1.prisma.channelBinding.deleteMany(),
                    prisma_js_1.prisma.publishSchedule.deleteMany(),
                    prisma_js_1.prisma.apiKey.deleteMany(),
                    prisma_js_1.prisma.serviceAccount.deleteMany(),
                    prisma_js_1.prisma.membership.deleteMany(),
                    prisma_js_1.prisma.notificationRule.deleteMany(),
                    prisma_js_1.prisma.usageRecord.deleteMany(),
                    prisma_js_1.prisma.featureFlag.deleteMany(),
                    prisma_js_1.prisma.idempotencyKey.deleteMany(),
                    prisma_js_1.prisma.task.deleteMany(),
                    prisma_js_1.prisma.aBSample.deleteMany(),
                    prisma_js_1.prisma.aBTest.deleteMany(),
                    prisma_js_1.prisma.tenantScope.deleteMany(),
                    prisma_js_1.prisma.user.deleteMany(),
                    prisma_js_1.prisma.organization.deleteMany()
                ])];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); };
exports.resetDatabase = resetDatabase;
