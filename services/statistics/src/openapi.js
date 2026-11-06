// Tài liệu OpenAPI (Swagger) cho service Thống kê
const bearer = [{ bearerAuth: [] }];
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Thống kê',
    version: '1.0.0',
    description:
      'Dashboard tỉ lệ đi học, số vắng theo buổi, danh sách sắp cấm thi, xuất Excel. ' +
      'Quy tắc: giới hạn vắng = tổng số buổi x tỉ lệ vắng cho phép; vắng > giới hạn: banned, = giới hạn: danger, = giới hạn-1: warning.',
  },
  servers: [{ url: '/api/statistics', description: 'Qua API Gateway' }, { url: 'http://localhost:4004', description: 'Trực tiếp' }],
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
  paths: {
    '/overview': { get: { tags: ['Thống kê'], summary: 'Tổng quan tất cả lớp của giảng viên', security: bearer, responses: { 200: { description: 'OK' } } } },
    '/classes/{id}/overview': { get: { tags: ['Thống kê'], summary: 'Số liệu dashboard của một lớp (theo buổi, theo sinh viên, tỉ lệ)', security: bearer, parameters: [idParam], responses: { 200: { description: 'OK' } } } },
    '/classes/{id}/risk': { get: { tags: ['Thống kê'], summary: 'Danh sách sinh viên sắp bị cấm thi', security: bearer, parameters: [idParam], responses: { 200: { description: 'OK' } } } },
    '/classes/{id}/export.xlsx': { get: { tags: ['Xuất file'], summary: 'Xuất báo cáo Excel (4 sheet)', security: bearer, parameters: [idParam], responses: { 200: { description: 'File xlsx' } } } },
  },
};
