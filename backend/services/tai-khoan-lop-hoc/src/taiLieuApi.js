// Tài liệu OpenAPI (Swagger) cho service Tài khoản & Lớp học
const bearer = [{ bearerAuth: [] }];
const json = (schema) => ({ content: { 'application/json': { schema } } });
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };

export const taiLieuApi = {
  openapi: '3.0.3',
  info: {
    title: 'Tài khoản & Lớp học',
    version: '1.0.0',
    description: 'Đăng nhập Google/JWT, quản lý lớp học và danh sách sinh viên.',
  },
  servers: [
    { url: '/api/account', description: 'Qua API Gateway' },
    { url: 'http://localhost:4001', description: 'Trực tiếp' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          email: { type: 'string' },
          name: { type: 'string' },
          picture: { type: 'string', nullable: true },
          role: { type: 'string', enum: ['teacher', 'student'] },
        },
      },
      AuthResult: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          user: { $ref: '#/components/schemas/User' },
        },
      },
      Class: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          code: { type: 'string', example: 'INT3505' },
          name: { type: 'string', example: 'Phát triển phần mềm hướng dịch vụ' },
          room: { type: 'string', nullable: true },
          semester: { type: 'string', nullable: true },
          total_sessions: { type: 'integer', example: 15 },
          max_absent_percent: { type: 'integer', example: 20 },
          student_count: { type: 'integer' },
          isOwner: { type: 'boolean' },
          myStudent: {
            type: 'object',
            nullable: true,
            description: 'Thông tin sinh viên trong lớp (khi người gọi là sinh viên)',
          },
        },
      },
      ClassInput: {
        type: 'object',
        required: ['code', 'name'],
        properties: {
          code: { type: 'string' },
          name: { type: 'string' },
          room: { type: 'string' },
          semester: { type: 'string' },
          totalSessions: { type: 'integer' },
          maxAbsentPercent: { type: 'integer' },
        },
      },
      Student: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          student_code: { type: 'string' },
          full_name: { type: 'string' },
          email: { type: 'string' },
        },
      },
      Error: { type: 'object', properties: { error: { type: 'string' } } },
    },
  },
  paths: {
    '/auth/config': {
      get: {
        tags: ['Đăng nhập'],
        summary: 'Cấu hình đăng nhập cho frontend',
        responses: { 200: { description: 'OK' } },
      },
    },
    '/auth/google': {
      post: {
        tags: ['Đăng nhập'],
        summary: 'Đăng nhập bằng Google (ID token)',
        requestBody: {
          required: true,
          ...json({ type: 'object', properties: { credential: { type: 'string' } } }),
        },
        responses: {
          200: {
            description: 'OK',
            ...json({ $ref: '#/components/schemas/AuthResult' }),
          },
          401: { description: 'Token sai' },
        },
      },
    },
    '/auth/dev-login': {
      post: {
        tags: ['Đăng nhập'],
        summary: 'Đăng nhập thử nghiệm (không cần Google)',
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            properties: {
              email: { type: 'string' },
              name: { type: 'string' },
              password: { type: 'string' },
              role: { type: 'string', enum: ['teacher', 'student'] },
            },
          }),
        },
        responses: {
          200: {
            description: 'OK',
            ...json({ $ref: '#/components/schemas/AuthResult' }),
          },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Đăng nhập'],
        summary: 'Đăng nhập bằng email + mật khẩu (mật khẩu mặc định là MSSV)',
        description:
          'Ở chế độ thử nghiệm (ALLOW_DEV_LOGIN): tài khoản chưa có mật khẩu sẽ nhận mật khẩu vừa nhập, tài khoản mới được tạo theo vai trò chọn.',
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['email', 'password'],
            properties: {
              email: { type: 'string' },
              password: { type: 'string' },
              role: { type: 'string', enum: ['teacher', 'student'] },
            },
          }),
        },
        responses: {
          200: {
            description: 'OK',
            ...json({ $ref: '#/components/schemas/AuthResult' }),
          },
          401: { description: 'Sai email hoặc mật khẩu' },
          429: { description: 'Nhập sai quá nhiều lần' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Đăng nhập'],
        summary: 'Thông tin người dùng hiện tại',
        security: bearer,
        responses: {
          200: { description: 'OK', ...json({ $ref: '#/components/schemas/User' }) },
        },
      },
      put: {
        tags: ['Đăng nhập'],
        summary: 'Sửa thông tin của chính mình',
        description:
          'Giảng viên đổi được email + mật khẩu; sinh viên chỉ đổi được mật khẩu. Trả về token mới (token cũ chứa email/role).',
        security: bearer,
        requestBody: {
          ...json({
            type: 'object',
            properties: {
              email: { type: 'string', example: 'email-moi@truong.edu.vn' },
              password: { type: 'string', example: 'mat-khau-moi' },
            },
          }),
        },
        responses: {
          200: {
            description: 'OK',
            ...json({ $ref: '#/components/schemas/AuthResult' }),
          },
          400: { description: 'Không có gì thay đổi hoặc dữ liệu không hợp lệ' },
          403: { description: 'Sinh viên không được đổi email' },
          409: { description: 'Email đã được tài khoản khác dùng' },
        },
      },
    },
    '/classes': {
      get: {
        tags: ['Lớp học'],
        summary: 'Danh sách lớp (giảng viên: lớp mình dạy; sinh viên: lớp mình học)',
        security: bearer,
        responses: {
          200: {
            description: 'OK',
            ...json({ type: 'array', items: { $ref: '#/components/schemas/Class' } }),
          },
        },
      },
      post: {
        tags: ['Lớp học'],
        summary: 'Tạo lớp (giảng viên)',
        security: bearer,
        requestBody: {
          required: true,
          ...json({ $ref: '#/components/schemas/ClassInput' }),
        },
        responses: {
          201: { description: 'Đã tạo', ...json({ $ref: '#/components/schemas/Class' }) },
        },
      },
    },
    '/classes/{id}': {
      get: {
        tags: ['Lớp học'],
        summary: 'Chi tiết lớp (service khác dùng để kiểm tra quyền truy cập)',
        security: bearer,
        parameters: [idParam],
        responses: {
          200: { description: 'OK', ...json({ $ref: '#/components/schemas/Class' }) },
          403: { description: 'Không thuộc lớp' },
          404: { description: 'Không có lớp' },
        },
      },
      put: {
        tags: ['Lớp học'],
        summary: 'Sửa lớp',
        security: bearer,
        parameters: [idParam],
        requestBody: {
          required: true,
          ...json({ $ref: '#/components/schemas/ClassInput' }),
        },
        responses: { 200: { description: 'OK' } },
      },
      delete: {
        tags: ['Lớp học'],
        summary: 'Xoá lớp',
        security: bearer,
        parameters: [idParam],
        responses: { 204: { description: 'Đã xoá' } },
      },
    },
    '/classes/{id}/students': {
      get: {
        tags: ['Sinh viên'],
        summary: 'Danh sách sinh viên của lớp (giảng viên)',
        security: bearer,
        parameters: [idParam],
        responses: {
          200: {
            description: 'OK',
            ...json({ type: 'array', items: { $ref: '#/components/schemas/Student' } }),
          },
        },
      },
      post: {
        tags: ['Sinh viên'],
        summary: 'Thêm/sửa một sinh viên',
        security: bearer,
        parameters: [idParam],
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            properties: {
              studentCode: { type: 'string' },
              fullName: { type: 'string' },
              email: { type: 'string' },
            },
          }),
        },
        responses: { 201: { description: 'OK' } },
      },
    },
    '/classes/{id}/students/bulk': {
      post: {
        tags: ['Sinh viên'],
        summary: 'Thêm nhanh nhiều sinh viên, mỗi dòng "MSSV|Họ tên|Email" (giảng viên)',
        description:
          'Mật khẩu đăng nhập của sinh viên là chính MSSV của họ, được mã hoá scrypt trước khi lưu. Dòng sai định dạng không được lưu và được trả về kèm lý do.',
        security: bearer,
        parameters: [idParam],
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['text'],
            properties: {
              text: {
                type: 'string',
                example: '2355010001|Hoàng Thị Bình An|binhanhoang0512@gmail.com',
              },
            },
          }),
        },
        responses: {
          200: {
            description: 'Số sinh viên đã lưu và danh sách dòng bị từ chối',
            ...json({
              type: 'object',
              properties: {
                imported: { type: 'integer' },
                invalid: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      line: { type: 'integer' },
                      text: { type: 'string' },
                      reason: { type: 'string' },
                    },
                  },
                },
              },
            }),
          },
        },
      },
    },
    '/classes/{id}/students/{studentId}': {
      delete: {
        tags: ['Sinh viên'],
        summary: 'Xoá sinh viên khỏi lớp',
        security: bearer,
        parameters: [
          idParam,
          { name: 'studentId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: { 204: { description: 'Đã xoá' } },
      },
    },
  },
};
