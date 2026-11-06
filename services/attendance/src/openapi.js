// Tài liệu OpenAPI (Swagger) cho service Điểm danh & Thông báo
const bearer = [{ bearerAuth: [] }];
const json = (schema) => ({ content: { 'application/json': { schema } } });
const intPath = (name) => ({ name, in: 'path', required: true, schema: { type: 'integer' } });
const statusEnum = { type: 'string', enum: ['present', 'late', 'excused', 'absent'] };

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Điểm danh & Thông báo',
    version: '1.0.0',
    description: 'Sinh viên quét QR điểm danh, giảng viên sửa tay, đơn xin vắng và email cảnh báo vắng nhiều.',
  },
  servers: [{ url: '/api/attendance', description: 'Qua API Gateway' }, { url: 'http://localhost:4003', description: 'Trực tiếp' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Status: statusEnum,
      Request: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, classId: { type: 'integer' }, sessionId: { type: 'integer' }, sessionNo: { type: 'integer' },
          studentCode: { type: 'string' }, studentName: { type: 'string' }, reason: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'approved', 'rejected'] }, teacherNote: { type: 'string', nullable: true },
        },
      },
    },
  },
  paths: {
    '/scan': {
      post: {
        tags: ['Điểm danh'], summary: 'Sinh viên quét QR để điểm danh', security: bearer,
        description: 'Gọi service buổi học để kiểm tra QR, gọi service lớp học để kiểm tra sinh viên thuộc lớp. Quá LATE_MINUTES phút kể từ lúc mở buổi sẽ tính là đi trễ.',
        requestBody: { required: true, ...json({ type: 'object', properties: { token: { type: 'string' } } }) },
        responses: { 200: { description: 'Điểm danh thành công (hoặc đã điểm danh trước đó)' }, 400: { description: 'QR sai' }, 403: { description: 'Không thuộc lớp' }, 410: { description: 'QR hết hạn / buổi đã đóng' } },
      },
    },
    '/sessions/{sessionId}/roster': {
      get: { tags: ['Điểm danh'], summary: 'Bảng điểm danh của buổi (giảng viên)', security: bearer, parameters: [intPath('sessionId')], responses: { 200: { description: 'OK' } } },
    },
    '/sessions/{sessionId}/students/{email}': {
      put: {
        tags: ['Điểm danh'], summary: 'Giảng viên sửa tay trạng thái điểm danh', security: bearer,
        parameters: [intPath('sessionId'), { name: 'email', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, ...json({ type: 'object', properties: { status: statusEnum, note: { type: 'string' } } }) },
        responses: { 200: { description: 'OK' } },
      },
    },
    '/classes/{classId}/records': {
      get: { tags: ['Điểm danh'], summary: 'Toàn bộ bản ghi điểm danh của lớp (service thống kê dùng)', security: bearer, parameters: [intPath('classId')], responses: { 200: { description: 'OK' } } },
    },
    '/classes/{classId}/me': {
      get: { tags: ['Điểm danh'], summary: 'Sinh viên xem lịch sử điểm danh của mình trong lớp', security: bearer, parameters: [intPath('classId')], responses: { 200: { description: 'OK' } } },
    },
    '/classes/{classId}/changes': {
      post: {
        tags: ['Điểm danh'], summary: 'Lưu nhiều thay đổi sửa tay cùng lúc (giảng viên)', security: bearer, parameters: [intPath('classId')],
        description: 'Kiểm tra toàn bộ trước khi ghi; có một thay đổi sai là từ chối cả lô (400). Ghi bằng một câu lệnh SQL nên không bao giờ ghi nửa chừng.',
        requestBody: { required: true, ...json({ type: 'object', properties: { changes: { type: 'array', items: { type: 'object', properties: { sessionId: { type: 'integer' }, email: { type: 'string' }, status: statusEnum } } } } }) },
        responses: { 200: { description: 'Đã lưu' }, 400: { description: 'Có thay đổi không hợp lệ, không lưu gì' } },
      },
    },
    '/classes/{classId}/sheet.xlsx': {
      get: { tags: ['Điểm danh bằng Excel'], summary: 'Tải file điểm danh của lớp (ma trận sinh viên x buổi)', description: 'Mỗi ô là một mã: x hoặc trống = có mặt, m = muộn, p = có phép, v = vắng. Chứa mã buổi để đối chiếu khi tải lên.', security: bearer, parameters: [intPath('classId')], responses: { 200: { description: 'File xlsx' } } },
    },
    '/classes/{classId}/sheet/import': {
      post: {
        tags: ['Điểm danh bằng Excel'], summary: 'Tải file điểm danh đã sửa lên', security: bearer,
        description: 'File phải đồng bộ 100% với hệ thống (cùng lớp, cùng danh sách sinh viên, cùng các buổi, mã hợp lệ). Có bất kỳ lỗi nào thì từ chối cả file (422) và liệt kê các ô lỗi. Dùng dryRun=1 để xem trước thay đổi mà chưa ghi.',
        parameters: [intPath('classId'), { name: 'dryRun', in: 'query', schema: { type: 'string', enum: ['1'] } }],
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } },
        responses: { 200: { description: 'Hợp lệ (đã áp dụng, hoặc bản xem trước nếu dryRun)' }, 422: { description: 'File chưa đồng bộ, kèm danh sách lỗi' } },
      },
    },
    '/requests': {
      get: { tags: ['Đơn xin vắng'], summary: 'Danh sách đơn (giảng viên: theo classId; sinh viên: đơn của mình)', security: bearer, parameters: [{ name: 'classId', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: 'OK', ...json({ type: 'array', items: { $ref: '#/components/schemas/Request' } }) } } },
      post: {
        tags: ['Đơn xin vắng'], summary: 'Sinh viên gửi đơn xin vắng cho một buổi', security: bearer,
        description: 'Gửi multipart/form-data (hoặc JSON nếu không có ảnh). Đính kèm tối đa 3 ảnh minh chứng JPG/PNG/WebP, mỗi ảnh tối đa 3MB.',
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { classId: { type: 'integer' }, sessionId: { type: 'integer' }, reason: { type: 'string' }, files: { type: 'array', items: { type: 'string', format: 'binary' } } } } }, 'application/json': { schema: { type: 'object', properties: { classId: { type: 'integer' }, sessionId: { type: 'integer' }, reason: { type: 'string' } } } } } },
        responses: { 201: { description: 'Đã gửi' }, 409: { description: 'Đã có đơn cho buổi này' } },
      },
    },
    '/requests/{id}/files/{fileId}': {
      get: { tags: ['Đơn xin vắng'], summary: 'Xem ảnh minh chứng (giảng viên của lớp hoặc sinh viên gửi đơn)', security: bearer, parameters: [intPath('id'), intPath('fileId')], responses: { 200: { description: 'Ảnh' }, 403: { description: 'Không có quyền' } } },
    },
    '/requests/{id}': {
      put: {
        tags: ['Đơn xin vắng'], summary: 'Giảng viên duyệt/từ chối đơn (duyệt => vắng có phép)', security: bearer, parameters: [intPath('id')],
        requestBody: { required: true, ...json({ type: 'object', properties: { status: { type: 'string', enum: ['approved', 'rejected'] }, teacherNote: { type: 'string' } } }) },
        responses: { 200: { description: 'OK' } },
      },
    },
    '/warnings/send': {
      post: {
        tags: ['Thông báo'], summary: 'Gửi email cảnh báo cho sinh viên vắng nhiều', security: bearer,
        description: 'Gọi service thống kê để lấy danh sách có nguy cơ, rồi gửi email (hoặc ghi log nếu chưa cấu hình SMTP).',
        requestBody: { required: true, ...json({ type: 'object', properties: { classId: { type: 'integer' } } }) },
        responses: { 200: { description: 'Kết quả gửi' } },
      },
    },
    '/notifications': {
      get: { tags: ['Thông báo'], summary: 'Lịch sử email đã gửi', security: bearer, parameters: [{ name: 'classId', in: 'query', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
    },
  },
};
