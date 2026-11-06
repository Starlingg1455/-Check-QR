// Tài liệu OpenAPI (Swagger) cho service Tài khoản & Lớp học
const bearer = [{ bearerAuth: [] }];
const json = (schema) => ({ content: { 'application/json': { schema } } });
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Tài khoản & Lớp học',
    version: '1.0.0',
    description: 'Đăng nhập Google/JWT, quản lý lớp học, import danh sách sinh viên từ Excel.',
  },
  servers: [{ url: '/api/account', description: 'Qua API Gateway' }, { url: 'http://localhost:4001', description: 'Trực tiếp' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      User: { type: 'object', properties: { id: { type: 'integer' }, email: { type: 'string' }, name: { type: 'string' }, picture: { type: 'string', nullable: true }, role: { type: 'string', enum: ['teacher', 'student'] } } },
      AuthResult: { type: 'object', properties: { token: { type: 'string' }, user: { $ref: '#/components/schemas/User' } } },
      Class: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, code: { type: 'string', example: 'INT3505' }, name: { type: 'string', example: 'Phát triển phần mềm hướng dịch vụ' },
          room: { type: 'string', nullable: true }, semester: { type: 'string', nullable: true },
          total_sessions: { type: 'integer', example: 15 }, max_absent_percent: { type: 'integer', example: 20 },
          student_count: { type: 'integer' }, isOwner: { type: 'boolean' },
          myStudent: { type: 'object', nullable: true, description: 'Thông tin sinh viên trong lớp (khi người gọi là sinh viên)' },
        },
      },
      ClassInput: {
        type: 'object', required: ['code', 'name'],
        properties: { code: { type: 'string' }, name: { type: 'string' }, room: { type: 'string' }, semester: { type: 'string' }, totalSessions: { type: 'integer' }, maxAbsentPercent: { type: 'integer' } },
      },
      Student: { type: 'object', properties: { id: { type: 'integer' }, student_code: { type: 'string' }, full_name: { type: 'string' }, email: { type: 'string' } } },
      Error: { type: 'object', properties: { error: { type: 'string' } } },
    },
  },
  paths: {
    '/auth/config': { get: { tags: ['Đăng nhập'], summary: 'Cấu hình đăng nhập cho frontend', responses: { 200: { description: 'OK' } } } },
    '/auth/google': {
      post: { tags: ['Đăng nhập'], summary: 'Đăng nhập bằng Google (ID token)', requestBody: { required: true, ...json({ type: 'object', properties: { credential: { type: 'string' } } }) }, responses: { 200: { description: 'OK', ...json({ $ref: '#/components/schemas/AuthResult' }) }, 401: { description: 'Token sai' } } },
    },
    '/auth/dev-login': {
      post: { tags: ['Đăng nhập'], summary: 'Đăng nhập thử nghiệm (không cần Google)', requestBody: { required: true, ...json({ type: 'object', properties: { email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string', enum: ['teacher', 'student'] } } }) }, responses: { 200: { description: 'OK', ...json({ $ref: '#/components/schemas/AuthResult' }) } } },
    },
    '/auth/me': { get: { tags: ['Đăng nhập'], summary: 'Thông tin người dùng hiện tại', security: bearer, responses: { 200: { description: 'OK', ...json({ $ref: '#/components/schemas/User' }) } } } },
    '/classes': {
      get: { tags: ['Lớp học'], summary: 'Danh sách lớp (giảng viên: lớp mình dạy; sinh viên: lớp mình học)', security: bearer, responses: { 200: { description: 'OK', ...json({ type: 'array', items: { $ref: '#/components/schemas/Class' } }) } } },
      post: { tags: ['Lớp học'], summary: 'Tạo lớp (giảng viên)', security: bearer, requestBody: { required: true, ...json({ $ref: '#/components/schemas/ClassInput' }) }, responses: { 201: { description: 'Đã tạo', ...json({ $ref: '#/components/schemas/Class' }) } } },
    },
    '/classes/{id}': {
      get: { tags: ['Lớp học'], summary: 'Chi tiết lớp (service khác dùng để kiểm tra quyền truy cập)', security: bearer, parameters: [idParam], responses: { 200: { description: 'OK', ...json({ $ref: '#/components/schemas/Class' }) }, 403: { description: 'Không thuộc lớp' }, 404: { description: 'Không có lớp' } } },
      put: { tags: ['Lớp học'], summary: 'Sửa lớp', security: bearer, parameters: [idParam], requestBody: { required: true, ...json({ $ref: '#/components/schemas/ClassInput' }) }, responses: { 200: { description: 'OK' } } },
      delete: { tags: ['Lớp học'], summary: 'Xoá lớp', security: bearer, parameters: [idParam], responses: { 204: { description: 'Đã xoá' } } },
    },
    '/classes/{id}/students': {
      get: { tags: ['Sinh viên'], summary: 'Danh sách sinh viên của lớp (giảng viên)', security: bearer, parameters: [idParam], responses: { 200: { description: 'OK', ...json({ type: 'array', items: { $ref: '#/components/schemas/Student' } }) } } },
      post: { tags: ['Sinh viên'], summary: 'Thêm/sửa một sinh viên', security: bearer, parameters: [idParam], requestBody: { required: true, ...json({ type: 'object', properties: { studentCode: { type: 'string' }, fullName: { type: 'string' }, email: { type: 'string' } } }) }, responses: { 201: { description: 'OK' } } },
    },
    '/classes/{id}/students/{studentId}': {
      delete: { tags: ['Sinh viên'], summary: 'Xoá sinh viên khỏi lớp', security: bearer, parameters: [idParam, { name: 'studentId', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 204: { description: 'Đã xoá' } } },
    },
    '/classes/{id}/students/import': {
      post: {
        tags: ['Sinh viên'], summary: 'Import sinh viên từ file Excel (.xlsx; cột MSSV, Họ tên, Email)', security: bearer, parameters: [idParam],
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } },
        responses: { 200: { description: 'Kết quả import', ...json({ type: 'object', properties: { imported: { type: 'integer' }, errors: { type: 'array', items: { type: 'object' } } } }) } },
      },
    },
    '/students-template.xlsx': { get: { tags: ['Sinh viên'], summary: 'Tải file Excel mẫu', responses: { 200: { description: 'File xlsx' } } } },
  },
};
