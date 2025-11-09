import { Router } from 'express';
import { env } from '../utils/env.js';

const bearerSecurity = [{ bearerAuth: [] }];

const schemas = {
  AuthRequest: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 8 }
    }
  },
  Task: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string', nullable: true },
      preset: { type: 'string', nullable: true },
      params: { type: 'object', additionalProperties: true },
      dependsOn: {
        type: 'array',
        items: { type: 'string' }
      },
      status: { type: 'string', enum: ['queued', 'running', 'success', 'failed', 'cancelled', 'paused'] },
      progress: { type: 'number' },
      eta: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' }
    }
  },
  TaskCreateRequest: {
    type: 'object',
    required: ['title', 'params'],
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      preset: { type: 'string' },
      dependsOn: {
        type: 'array',
        items: { type: 'string' }
      },
      params: {
        type: 'object',
        description:
          'Task payload. Examples: `{ "kind":"subtitle","language":"en-US","inputAudio":"./sample.wav" }`, `{ "kind":"burn","inputVideo":"workspace/uploads/demo.mp4" }`, `{ "kind":"gen_video","prompt":"A neon skyline","duration":10,"resolution":"1080p","aspect":"16:9","providerPolicy":"balanced" }`',
        additionalProperties: true
      }
    }
  },
  TaskControlRequest: {
    type: 'object',
    required: ['action'],
    properties: {
      action: { type: 'string', enum: ['pause', 'resume', 'cancel'] }
    }
  },
  PipelineSubmitRequest: {
    type: 'object',
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          required: ['title', 'params'],
          properties: {
            localId: { type: 'string' },
            title: { type: 'string' },
            preset: { type: 'string' },
            params: { type: 'object', additionalProperties: true },
            dependsOn: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      }
    }
  },
  PublishScheduleRequest: {
    type: 'object',
    required: ['platform', 'language', 'region', 'scheduledAt'],
    properties: {
      platform: { type: 'string' },
      language: { type: 'string' },
      region: { type: 'string' },
      scheduledAt: { type: 'string', format: 'date-time' },
      owner: { type: 'string' },
      notes: { type: 'string' }
    }
  },
  PipelineTemplateStage: {
    type: 'object',
    required: ['title', 'params'],
    properties: {
      id: { type: 'string' },
      title: { type: 'string' },
      preset: { type: 'string' },
      params: { type: 'object', additionalProperties: true },
      dependsOn: {
        type: 'array',
        items: { type: 'string' }
      },
      retries: { type: 'integer', minimum: 0 },
      timeout: { type: 'integer', minimum: 1 }
    }
  },
  PipelineTemplateRequest: {
    type: 'object',
    required: ['stages'],
    properties: {
      stages: {
        type: 'array',
        items: { $ref: '#/components/schemas/PipelineTemplateStage' }
      },
      retries: { type: 'integer', minimum: 0 },
      timeout: { type: 'integer', minimum: 1 }
    }
  },
  FeatureFlag: {
    type: 'object',
    properties: {
      key: { type: 'string' },
      defaultValue: { type: 'boolean' },
      overrides: {
        type: 'object',
        additionalProperties: { type: 'boolean' }
      }
    }
  },
  FeatureFlagRequest: {
    type: 'object',
    required: ['key', 'defaultValue'],
    properties: {
      key: { type: 'string' },
      defaultValue: { type: 'boolean' }
    }
  },
  FeatureFlagOverrideRequest: {
    type: 'object',
    required: ['orgId', 'value'],
    properties: {
      orgId: { type: 'string' },
      value: { type: 'boolean' }
    }
  },
  UploadPresignRequest: {
    type: 'object',
    required: ['filename', 'contentType', 'size'],
    properties: {
      filename: { type: 'string' },
      contentType: { type: 'string' },
      size: { type: 'integer', minimum: 1 },
      checksum: { type: 'string', description: 'Optional sha256 hex' }
    }
  },
  UploadPresignResponse: {
    type: 'object',
    properties: {
      uploadUrl: { type: 'string' },
      method: { type: 'string', enum: ['PUT'] },
      finalPath: { type: 'string' },
      headers: {
        type: 'object',
        additionalProperties: { type: 'string' }
      }
    }
  },
  UsageBucket: {
    type: 'object',
    properties: {
      used: { type: 'number' },
      limit: { type: 'number' }
    }
  },
  UsageStorage: {
    type: 'object',
    properties: {
      usedBytes: { type: 'integer' },
      limitBytes: { type: 'integer' }
    }
  },
  UsageSnapshot: {
    type: 'object',
    properties: {
      tasks: { $ref: '#/components/schemas/UsageBucket' },
      renderMinutes: { $ref: '#/components/schemas/UsageBucket' },
      storage: { $ref: '#/components/schemas/UsageStorage' }
    }
  },
  LangMeta: {
    type: 'object',
    properties: {
      code: { type: 'string' },
      iso639_1: { type: 'string' },
      name: { type: 'string' },
      englishName: { type: 'string' },
      flag: { type: 'string' },
      rtl: { type: 'boolean' },
      ttsHint: {
        type: 'array',
        items: { type: 'string' }
      }
    }
  },
  CostProviderSummary: {
    type: 'object',
    properties: {
      provider: { type: 'string' },
      policy: { type: 'string' },
      tasks: { type: 'integer' },
      billedMinutes: { type: 'integer' },
      costCents: { type: 'integer' },
      successRate: { type: 'number' },
      unitCostCents: { type: 'number' }
    }
  },
  CostSummary: {
    type: 'object',
    properties: {
      window: {
        type: 'object',
        properties: {
          start: { type: 'string', format: 'date-time' },
          end: { type: 'string', format: 'date-time' }
        }
      },
      totalCostCents: { type: 'integer' },
      totalMinutes: { type: 'integer' },
      totalTasks: { type: 'integer' },
      successRate: { type: 'number' },
      perProvider: {
        type: 'array',
        items: { $ref: '#/components/schemas/CostProviderSummary' }
      }
    }
  },
  ProviderEconomicsSignal: {
    type: 'object',
    properties: {
      provider: { type: 'string' },
      policy: { type: 'string' },
      unitCostCents: { type: 'number' },
      expectedUnitCostCents: { type: 'number' },
      sigma: { type: 'number' },
      deviationPercent: { type: 'number' },
      tasks: { type: 'integer' },
      billedMinutes: { type: 'integer' },
      costCents: { type: 'integer' },
      successRate: { type: 'number' }
    }
  },
  UnitEconomicsSummary: {
    type: 'object',
    properties: {
      window: {
        type: 'object',
        properties: {
          start: { type: 'string', format: 'date-time' },
          end: { type: 'string', format: 'date-time' }
        }
      },
      averageUnitCostCents: { type: 'number' },
      sigma: { type: 'number' },
      thresholdSigma: { type: 'number' },
      providerSignals: {
        type: 'array',
        items: { $ref: '#/components/schemas/ProviderEconomicsSignal' }
      }
    }
  },
  SlaSummary: {
    type: 'object',
    properties: {
      window: {
        type: 'object',
        properties: {
          start: { type: 'string', format: 'date-time' },
          end: { type: 'string', format: 'date-time' }
        }
      },
      api: {
        type: 'object',
        properties: {
          successRate: { type: 'number' },
          target: { type: 'number' },
          total: { type: 'integer' }
        }
      },
      generation: {
        type: 'object',
        properties: {
          successRate: { type: 'number' },
          target: { type: 'number' },
          total: { type: 'integer' }
        }
      }
    }
  }
} as const;

const openApiDocument = {
  openapi: '3.0.1',
  info: {
    title: 'YouTube Tool Flagship API',
    version: '0.2.0',
    description: 'Operational API that powers the subtitle → dubbing → burn pipeline, analytics, and auxiliary endpoints.'
  },
  servers: [
    {
      url: `http://localhost:${env.PORT}/v1`
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    },
    schemas
  },
  paths: {
    '/v1/healthz': {
      get: {
        summary: 'Health probe',
        responses: {
          200: {
            description: 'Service health snapshot'
          }
        }
      }
    },
    '/v1/auth/register': {
      post: {
        summary: 'Register operator account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AuthRequest' }
            }
          }
        },
        responses: {
          201: { description: 'Account created' },
          409: { description: 'Email already exists' }
        }
      }
    },
    '/v1/auth/login': {
      post: {
        summary: 'Login and retrieve JWT',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AuthRequest' }
            }
          }
        },
        responses: {
          200: {
            description: 'JWT token',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { token: { type: 'string' } }
                }
              }
            }
          },
          401: { description: 'Invalid credentials' }
        }
      }
    },
    '/v1/tasks': {
      get: {
        summary: 'List tasks',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Comma separated statuses' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
        ],
        security: bearerSecurity,
        responses: {
          200: {
            description: 'Array of tasks',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Task' }
                }
              }
            }
          }
        }
      },
      post: {
        summary: 'Create task',
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TaskCreateRequest' }
            }
          }
        },
        responses: {
          201: {
            description: 'Task created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Task' }
              }
            }
          },
          400: { description: 'Validation error' }
        }
      }
    },
    '/v1/tasks/{id}': {
      get: {
        summary: 'Fetch task',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        security: bearerSecurity,
        responses: {
          200: {
            description: 'Task detail',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Task' }
              }
            }
          },
          404: { description: 'Task not found' }
        }
      },
      patch: {
        summary: 'Control task',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TaskControlRequest' }
            }
          }
        },
        responses: {
          200: { description: 'Updated task' },
          400: { description: 'Invalid action' }
        }
      }
    },
    '/v1/pipeline/submit': {
      post: {
        summary: 'Submit pipeline batch',
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PipelineSubmitRequest' }
            }
          }
        },
        responses: {
          200: { description: 'Pipeline accepted' },
          400: { description: 'Invalid pipeline definition' }
        }
      }
    },
    '/v1/pipeline/run': {
      post: {
        summary: 'Run pipeline template',
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                anyOf: [
                  { $ref: '#/components/schemas/PipelineTemplateRequest' },
                  { type: 'object', required: ['template'], properties: { template: { type: 'string' } } }
                ]
              }
            }
          }
        },
        responses: {
          200: { description: 'Pipeline instantiated' },
          400: { description: 'Invalid template' }
        }
      }
    },
    '/v1/events': {
      get: {
        summary: 'Task progress stream',
        parameters: [{ name: 'taskId', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Server Sent Events stream',
            content: {
              'text/event-stream': {
                schema: { type: 'string' }
              }
            }
          }
        }
      }
    },
    '/v1/ai/titles': {
      post: {
        summary: 'Generate AI titles',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['topic', 'language', 'count'],
                properties: {
                  topic: { type: 'string' },
                  language: { type: 'string' },
                  count: { type: 'integer', minimum: 1, maximum: 10 }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Title suggestions' }
        }
      }
    },
    '/v1/publish/schedule': {
      post: {
        summary: 'Create publish schedule',
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PublishScheduleRequest' }
            }
          }
        },
        responses: {
          201: { description: 'Schedule created' }
        }
      }
    },
    '/v1/publish/list': {
      get: {
        summary: 'List publish events',
        security: bearerSecurity,
        responses: {
          200: { description: 'Scheduled items' }
        }
      }
    },
    '/v1/uploads': {
      post: {
        summary: 'Upload local asset',
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Upload stored' }
        }
      }
    },
    '/v1/uploads/presign': {
      post: {
        summary: 'Create presigned upload (S3 only)',
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UploadPresignRequest' }
            }
          }
        },
        responses: {
          200: {
            description: 'Presign payload',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UploadPresignResponse' }
              }
            }
          },
          400: { description: 'Backend not configured for S3' }
        }
      }
    },
    '/v1/admin/flags': {
      get: {
        summary: 'List feature flags',
        security: bearerSecurity,
        responses: {
          200: {
            description: 'Flag inventory',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/FeatureFlag' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        summary: 'Create or update a feature flag',
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/FeatureFlagRequest' }
            }
          }
        },
        responses: {
          201: {
            description: 'Flag saved',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' },
                    defaultValue: { type: 'boolean' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/admin/flags/{key}': {
      delete: {
        summary: 'Delete a feature flag',
        security: bearerSecurity,
        parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          204: { description: 'Flag removed' },
          404: { description: 'Flag not found' }
        }
      }
    },
    '/v1/admin/flags/{key}/overrides': {
      post: {
        summary: 'Set org override for a flag',
        security: bearerSecurity,
        parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/FeatureFlagOverrideRequest' }
            }
          }
        },
        responses: {
          200: { description: 'Override saved' },
          404: { description: 'Flag not found' }
        }
      }
    },
    '/v1/admin/flags/{key}/overrides/{orgId}': {
      delete: {
        summary: 'Remove org override',
        security: bearerSecurity,
        parameters: [
          { name: 'key', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'orgId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          204: { description: 'Override removed' },
          404: { description: 'Flag not found' }
        }
      }
    },
    '/v1/admin/flags/{key}/invalidate': {
      post: {
        summary: 'Invalidate flag cache',
        security: bearerSecurity,
        parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          202: { description: 'Invalidation scheduled' },
          404: { description: 'Flag not found' }
        }
      }
    },
    '/v1/admin/webhooks/deliveries': {
      get: {
        summary: 'List webhook deliveries',
        security: bearerSecurity,
        parameters: [
          { name: 'taskId', in: 'query', schema: { type: 'string' } },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['pending', 'retrying', 'success', 'failed'] }
          },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } }
        ],
        responses: {
          200: {
            description: 'Delivery list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          taskId: { type: 'string' },
                          targetUrl: { type: 'string' },
                          status: { type: 'string' },
                          attempts: { type: 'integer' },
                          maxAttempts: { type: 'integer' },
                          lastResponseCode: { type: 'integer', nullable: true },
                          lastDurationMs: { type: 'integer', nullable: true },
                          lastError: { type: 'string', nullable: true },
                          payload: {
                            oneOf: [{ type: 'object' }, { type: 'string' }]
                          },
                          createdAt: { type: 'string', format: 'date-time' },
                          completedAt: { type: 'string', format: 'date-time', nullable: true }
                        }
                      }
                    },
                    nextCursor: { type: 'string', nullable: true }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/admin/webhooks/test': {
      post: {
        summary: 'Send a test webhook delivery',
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['taskId', 'url'],
                properties: {
                  taskId: { type: 'string' },
                  url: { type: 'string', format: 'uri' },
                  secret: { type: 'string' },
                  payload: { type: 'object' }
                }
              }
            }
          }
        },
        responses: {
          202: { description: 'Delivery scheduled' },
          404: { description: 'Task not found' }
        }
      }
    },
    '/v1/admin/webhooks/redeliver/{deliveryId}': {
      post: {
        summary: 'Redeliver a stored webhook payload',
        security: bearerSecurity,
        parameters: [{ name: 'deliveryId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          202: { description: 'Redelivery scheduled' },
          404: { description: 'Delivery not found' }
        }
      }
    },
    '/v1/billing/usage': {
      get: {
        summary: 'Retrieve usage snapshot',
        security: bearerSecurity,
        responses: {
          200: {
            description: 'Usage snapshot for current org',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UsageSnapshot' }
              }
            }
          }
        }
      }
    },
    '/v1/files/{taskId}/{artifact}': {
      get: {
        summary: 'Stream task artifact file',
        security: bearerSecurity,
        parameters: [
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'artifact', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'Binary artifact stream',
            content: {
              'application/octet-stream': {
                schema: { type: 'string', format: 'binary' }
              }
            }
          },
          404: { description: 'Task or artifact not found' }
        }
      }
    },
    '/v1/analytics/costs': {
      get: {
        summary: 'Cost rollup summary',
        security: bearerSecurity,
        parameters: [
          {
            name: 'windowHours',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 168 },
            description: 'Hours before now to roll up; defaults to 24'
          }
        ],
        responses: {
          200: {
            description: 'Aggregated cost snapshot',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { $ref: '#/components/schemas/CostSummary' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/analytics/unit-economics': {
      get: {
        summary: 'Unit economics signals',
        security: bearerSecurity,
        parameters: [
          {
            name: 'windowHours',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 168 },
            description: 'Hours before now to analyze; defaults to 24'
          }
        ],
        responses: {
          200: {
            description: 'Unit economics summary',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { $ref: '#/components/schemas/UnitEconomicsSummary' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/analytics/sla': {
      get: {
        summary: 'SLO health for API and generation',
        security: bearerSecurity,
        parameters: [
          {
            name: 'windowHours',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 168 },
            description: 'Hours before now to include; defaults to 24'
          }
        ],
        responses: {
          200: {
            description: 'SLA report',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { $ref: '#/components/schemas/SlaSummary' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/metrics': {
      get: {
        summary: 'Prometheus metrics',
        responses: {
          200: {
            description: 'Text exposition format',
            content: {
              'text/plain': { schema: { type: 'string' } }
            }
          }
        }
      }
    },
    '/v1/languages': {
      get: {
        summary: 'List supported languages',
        security: bearerSecurity,
        responses: {
          200: {
            description: 'Catalog of supported languages',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/LangMeta' }
                    },
                    count: { type: 'integer' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
} as const;

export const docsRouter = Router();

docsRouter.get('/openapi.json', (_req, res) => {
  res.json(openApiDocument);
});
