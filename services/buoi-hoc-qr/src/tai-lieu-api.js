// Tài liệu OpenAPI (Swagger) cho service Buổi học & Mã QR
const bearer = [{ bearerAuth: [] }];
const json = (schema) => ({ content: { 'application/json': { schema } } });
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };

export const taiLieuApi = {
  openapi: '3.0.3',
  info: {
    title: 'Buổi học & Mã QR',
    version: '1.0.0',
    description: 'Mở/đóng buổi điểm danh. Mã QR được ký HMAC và đổi mỗi 30 giây để chống điểm danh hộ.',
  },
  servers: [{ url: '/api/sessions', description: 'Qua API Gateway' }, { url: 'http://localhost:4002', description: 'Trực tiếp' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Session: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, classId: { type: 'integer' }, sessionNo: { type: 'integer' }, title: { type: 'string' },
          status: { type: 'string', enum: ['open', 'closed'] }, openedAt: { type: 'string', format: 'date-time' }, closedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      QrToken: {
        type: 'object',
        properties: { token: { type: 'string', example: '12.58000123.abcDEF1234567890' }, ttl: { type: 'integer', example: 30 }, expiresAt: { type: 'integer', description: 'Thời điểm hết hạn (ms)' }, serverTime: { type: 'integer' } },
      },
    },
  },
  paths: {
    '/sessions': {
      get: { tags: ['Buổi học'], summary: 'Danh sách buổi học của lớp', security: bearer, parameters: [{ name: 'classId', in: 'query', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK', ...json({ type: 'array', items: { $ref: '#/components/schemas/Session' } }) } } },
      post: {
        tags: ['Buổi học'], summary: 'Mở buổi điểm danh mới (giảng viên). Mỗi lớp chỉ có 1 buổi đang mở.', security: bearer,
        requestBody: { required: true, ...json({ type: 'object', required: ['classId'], properties: { classId: { type: 'integer' }, title: { type: 'string' }, openedAt: { type: 'string', format: 'date-time', description: 'Tuỳ chọn, để nhập bù buổi cũ' } } }) },
        responses: { 201: { description: 'Đã mở', ...json({ $ref: '#/components/schemas/Session' }) }, 409: { description: 'Đang có buổi chưa đóng' } },
      },
    },
    '/sessions/{id}': {
      get: { tags: ['Buổi học'], summary: 'Chi tiết buổi học', security: bearer, parameters: [idParam], responses: { 200: { description: 'OK', ...json({ $ref: '#/components/schemas/Session' }) } } },
      delete: { tags: ['Buổi học'], summary: 'Xoá buổi học', security: bearer, parameters: [idParam], responses: { 204: { description: 'Đã xoá' } } },
    },
    '/sessions/{id}/qr': {
      get: { tags: ['Mã QR'], summary: 'Lấy mã QR hiện tại (đổi mỗi 30 giây)', security: bearer, parameters: [idParam], responses: { 200: { description: 'OK', ...json({ $ref: '#/components/schemas/QrToken' }) }, 409: { description: 'Buổi đã đóng' } } },
    },
    '/sessions/{id}/close': {
      post: { tags: ['Buổi học'], summary: 'Đóng buổi điểm danh', security: bearer, parameters: [idParam], responses: { 200: { description: 'OK', ...json({ $ref: '#/components/schemas/Session' }) } } },
    },
    '/sessions/verify': {
      post: {
        tags: ['Mã QR'], summary: 'Kiểm tra mã QR (service điểm danh gọi nội bộ)', security: bearer,
        requestBody: { required: true, ...json({ type: 'object', properties: { token: { type: 'string' } } }) },
        responses: { 200: { description: 'Hợp lệ' }, 400: { description: 'Mã sai' }, 410: { description: 'Hết hạn / buổi đã đóng' } },
      },
    },
  },
};
