---
layout: post
title: "개발자노트: API-First Development, Swagger 중심의 TDD 워크플로우"
author: "Jin"
tags: 소프트웨어공학
---

## 왜 항상 API 문서와 실제 구현이 다를까

프로젝트를 중간에 합류해서 유지보수를 담당하게 된 적이 있었다. 

그런데 작업을 시작하자마자 **문제들이 하나씩 드러나기 시작했다**. Swagger에는 **에러 케이스가 정의되어 있지 않거나**, Swagger에 정의된 DTO와 **실제 서버에서 클라이언트로 넘어오는 값이 완전히 달랐다**.

처음에는 **"이게 말이 되나?"** 싶었다. 하지만 원인을 파악해보니 **테스트코드가 전혀 없어서** 이런 불일치를 검증할 방법이 없었던 것이다. 

이런 상황을 근본적으로 방지하고, **AI를 적극적으로 활용한 효율적인 개발**을 위해서는 **Swagger를 먼저 작성하고 개발하는 API-First Development** 를 도입하는 것이 답이라고 생각했다.

## API-First Development 프로세스

**핵심 아이디어**: Swagger 명세서를 먼저 작성하고, 이를 기반으로 모든 개발을 진행한다.

### 전체 프로세스 흐름

```markdown
1. Swagger 명세 + DBML 초안 작성
   ↓
2. AI를 이용한 백엔드/프론트엔드 코드 생성
   - NestJS Controller/Service/DTO
   - Flutter Model/Repository/BLoC
   ↓  
3. Unit Test 코드 생성 및 TDD 적용 (백엔드)
   ↓
4. E2E 테스트 생성 (백엔드) + Flutter BLoC State 기반 TDD
   ↓
5. NestJS에서 Swagger 데코레이터로 문서 생성
   ↓
6. 원본 Swagger와 비교 검증
```

### 1단계: Swagger 명세 + DBML 초안 작성

**먼저 API 설계부터 시작한다**:

```yaml
# swagger.yaml 예시
paths:
  /api/users:
    post:
      summary: 사용자 생성
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                email:
                  type: string
                  format: email
                password:
                  type: string
                  minLength: 8
      responses:
        201:
          description: 사용자 생성 성공
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        400:
          description: 잘못된 요청
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
```

**동시에 DBML로 데이터베이스 설계**:

```sql
// dbml 예시
Table users {
  id integer [primary key]
  email varchar [unique, not null]
  password_hash varchar [not null]
  created_at timestamp [default: `now()`]
  updated_at timestamp [default: `now()`]
}
```

### 2단계: AI를 이용한 백엔드/프론트엔드 코드 생성

**Swagger 명세를 기반으로 AI에게 초기 코드 생성 요청**:

**백엔드 (NestJS) 코드 생성**:

```typescript
// AI 생성 예시: user.controller.ts
@Controller('api/users')
@ApiTags('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @ApiOperation({ summary: '사용자 생성' })
  @ApiResponse({ status: 201, description: '사용자 생성 성공', type: UserDto })
  @ApiResponse({ status: 400, description: '잘못된 요청', type: ErrorDto })
  async createUser(@Body() createUserDto: CreateUserDto): Promise<UserDto> {
    return this.userService.create(createUserDto);
  }
}
```

**앱(Flutter) 코드 생성**:

```dart
// AI 생성 예시: user_model.dart (Swagger 스키마 기반)
class User {
  final int id;
  final String email;
  final DateTime createdAt;

  User({required this.id, required this.email, required this.createdAt});

  factory User.fromJson(Map<String, dynamic> json) => User(
    id: json['id'],
    email: json['email'],
    createdAt: DateTime.parse(json['created_at']),
  );
}

// AI 생성 예시: user_state.dart
abstract class UserState extends Equatable {
  const UserState();
  @override
  List<Object?> get props => [];
}

class UserInitial extends UserState {}
class UserLoading extends UserState {}
class UserSuccess extends UserState {
  final User user;
  const UserSuccess(this.user);
  @override
  List<Object> get props => [user];
}
class UserError extends UserState {
  final String message;
  const UserError(this.message);
  @override
  List<Object> get props => [message];
}

// AI 생성 예시: user_repository.dart
abstract class UserRepository {
  Future<User> createUser(CreateUserRequest request);
}

class UserRepositoryImpl implements UserRepository {
  final Dio dio;
  UserRepositoryImpl({required this.dio});

  @override
  Future<User> createUser(CreateUserRequest request) async {
    try {
      final response = await dio.post('/api/users', data: request.toJson());
      return User.fromJson(response.data);
    } on DioException catch (e) {
      if (e.response?.statusCode == 400) {
        throw DuplicateEmailException(e.response?.data['message']);
      }
      throw ServerException('사용자 생성에 실패했습니다');
    }
  }
}

// AI 생성 예시: user_bloc.dart
class UserBloc extends Bloc<UserEvent, UserState> {
  final UserRepository repository;

  UserBloc({required this.repository}) : super(UserInitial()) {
    on<CreateUserEvent>(_onCreateUser);
  }

  Future<void> _onCreateUser(CreateUserEvent event, Emitter<UserState> emit) async {
    emit(UserLoading());
    
    try {
      final user = await repository.createUser(
        CreateUserRequest(email: event.email, password: event.password),
      );
      emit(UserSuccess(user));
    } on DuplicateEmailException catch (e) {
      emit(UserError(e.message));
    } on ServerException catch (e) {
      emit(UserError(e.message));
    }
  }
}
```

**AI 코드 생성 실무 팁**:

```markdown
효과적인 AI 프롬프팅:
1. Swagger YAML 전체를 컨텍스트로 제공
2. "NestJS + TypeScript + Clean Architecture" 명시
3. "Flutter + BLoC 패턴 + Repository 패턴" 명시
4. 에러 처리 방식과 예외 클래스 구조 명시

생성된 코드 검토 포인트:
- 타입 안정성: TypeScript/Dart 타입 정의 정확성
- 에러 처리: HTTP 상태코드별 적절한 예외 처리
- 의존성 주입: 생성자 주입 패턴 준수
- 명명 규칙: 각 언어의 컨벤션 준수
```

### 3단계: Unit Test 코드 생성 및 TDD 적용

**테스트를 먼저 작성하고 구현을 진행**:

```typescript
// user.service.spec.ts
describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserService, ...mockProviders],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  describe('create', () => {
    it('올바른 데이터로 사용자를 생성해야 한다', async () => {
      // Given
      const createUserDto = {
        email: 'test@example.com',
        password: 'password123'
      };

      // When
      const result = await service.create(createUserDto);

      // Then
      expect(result.email).toBe(createUserDto.email);
      expect(result.id).toBeDefined();
    });

    it('이메일 중복 시 ConflictException을 발생시켜야 한다', async () => {
      // Given
      const duplicateEmail = 'duplicate@example.com';
      
      // When & Then
      await expect(service.create({ 
        email: duplicateEmail, 
        password: 'password123' 
      })).rejects.toThrow(ConflictException);
    });
  });
});
```

### 4-1단계: E2E 테스트 생성 (백엔드)

**실제 API 호출을 통한 통합 테스트**:

```typescript
// user.e2e-spec.ts
describe('/api/users (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/api/users (POST) - 성공', () => {
    return request(app.getHttpServer())
      .post('/api/users')
      .send({
        email: 'test@example.com',
        password: 'password123'
      })
      .expect(201)
      .expect((res) => {
        expect(res.body.email).toBe('test@example.com');
        expect(res.body.id).toBeDefined();
      });
  });

  it('/api/users (POST) - 잘못된 이메일 형식', () => {
    return request(app.getHttpServer())
      .post('/api/users')
      .send({
        email: 'invalid-email',
        password: 'password123'
      })
      .expect(400);
  });
});
```

### 4-2단계: Flutter 테스트 코드 생성

**2단계에서 구현된 Flutter 코드의 검증을 위한 테스트 작성**:

**BLoC Unit 테스트**:

```dart
// test/bloc/user_bloc_test.dart
void main() {
  group('UserBloc', () {
    late UserBloc userBloc;
    late MockUserRepository mockRepository;

    setUp(() {
      mockRepository = MockUserRepository();
      userBloc = UserBloc(repository: mockRepository);
    });

    blocTest<UserBloc, UserState>(
      '사용자 생성 성공 시 UserSuccess state를 emit한다',
      build: () {
        when(() => mockRepository.createUser(any()))
            .thenAnswer((_) async => User(id: 1, email: 'test@example.com'));
        return userBloc;
      },
      act: (bloc) => bloc.add(CreateUserEvent(
        email: 'test@example.com',
        password: 'password123',
      )),
      expect: () => [
        UserLoading(),
        UserSuccess(User(id: 1, email: 'test@example.com')),
      ],
    );

    blocTest<UserBloc, UserState>(
      '이메일 중복 시 UserError state를 emit한다',
      build: () {
        when(() => mockRepository.createUser(any()))
            .thenThrow(DuplicateEmailException('이미 존재하는 이메일입니다'));
        return userBloc;
      },
      act: (bloc) => bloc.add(CreateUserEvent(
        email: 'duplicate@example.com',
        password: 'password123',
      )),
      expect: () => [
        UserLoading(),
        UserError('이미 존재하는 이메일입니다'),
      ],
    );
  });
}
```

**Repository 테스트**:

```dart
// test/repository/user_repository_test.dart
void main() {
  group('UserRepositoryImpl', () {
    late UserRepositoryImpl repository;
    late MockDio mockDio;

    setUp(() {
      mockDio = MockDio();
      repository = UserRepositoryImpl(dio: mockDio);
    });

    test('API 호출 성공 시 User 객체를 반환한다', () async {
      // Given
      when(() => mockDio.post('/api/users', data: any(named: 'data')))
          .thenAnswer((_) async => Response(
                data: {'id': 1, 'email': 'test@example.com', 'created_at': '2023-01-01T00:00:00Z'},
                statusCode: 201,
                requestOptions: RequestOptions(path: '/api/users'),
              ));

      // When
      final result = await repository.createUser(
        CreateUserRequest(email: 'test@example.com', password: 'password123'),
      );

      // Then
      expect(result.id, 1);
      expect(result.email, 'test@example.com');
    });

    test('400 에러 시 DuplicateEmailException을 던진다', () async {
      // Given
      when(() => mockDio.post('/api/users', data: any(named: 'data')))
          .thenThrow(DioException(
            response: Response(
              data: {'message': '이미 존재하는 이메일입니다'},
              statusCode: 400,
              requestOptions: RequestOptions(path: '/api/users'),
            ),
            requestOptions: RequestOptions(path: '/api/users'),
          ));

      // When & Then
      expect(
        () => repository.createUser(
          CreateUserRequest(email: 'duplicate@example.com', password: 'password123'),
        ),
        throwsA(isA<DuplicateEmailException>()),
      );
    });
  });
}
```

**Widget 테스트**:

```dart
// test/widget/user_create_widget_test.dart
void main() {
  group('UserCreateWidget', () {
    late MockUserBloc mockUserBloc;

    setUp(() {
      mockUserBloc = MockUserBloc();
    });

    testWidgets('UserLoading 상태에서 로딩 인디케이터가 표시된다', (tester) async {
      // Given
      when(() => mockUserBloc.state).thenReturn(UserLoading());

      // When
      await tester.pumpWidget(
        BlocProvider<UserBloc>(
          create: (_) => mockUserBloc,
          child: MaterialApp(home: UserCreateWidget()),
        ),
      );

      // Then
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('UserError 상태에서 에러 메시지가 표시된다', (tester) async {
      // Given
      when(() => mockUserBloc.state).thenReturn(UserError('이미 존재하는 이메일입니다'));

      // When
      await tester.pumpWidget(
        BlocProvider<UserBloc>(
          create: (_) => mockUserBloc,
          child: MaterialApp(home: UserCreateWidget()),
        ),
      );

      // Then
      expect(find.text('이미 존재하는 이메일입니다'), findsOneWidget);
    });

    testWidgets('폼 입력 후 제출 시 CreateUserEvent가 발생한다', (tester) async {
      // Given
      when(() => mockUserBloc.state).thenReturn(UserInitial());

      // When
      await tester.pumpWidget(
        BlocProvider<UserBloc>(
          create: (_) => mockUserBloc,
          child: MaterialApp(home: UserCreateWidget()),
        ),
      );

      await tester.enterText(find.byKey(Key('email_field')), 'test@example.com');
      await tester.enterText(find.byKey(Key('password_field')), 'password123');
      await tester.tap(find.byKey(Key('submit_button')));
      await tester.pump();

      // Then
      verify(() => mockUserBloc.add(CreateUserEvent(
        email: 'test@example.com',
        password: 'password123',
      ))).called(1);
    });
  });
}
```

### 5단계: NestJS Swagger 데코레이터로 문서 생성

**구현된 코드에서 실제 API 문서 자동 생성**:

```typescript
// main.ts
const config = new DocumentBuilder()
  .setTitle('User API')
  .setDescription('사용자 관리 API')
  .setVersion('1.0')
  .build();

const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api-docs', app, document);
```

### 6단계: 원본 Swagger와 비교 검증

**1단계에서 작성한 원본 명세와 5단계에서 생성된 문서 비교**:

```bash
# swagger-diff 도구 활용
npm install -g swagger-diff
swagger-diff original-swagger.yaml generated-swagger.json

# 차이점 발견 시 코드 수정 또는 원본 명세 업데이트
```

## 테스트 코드의 종류와 역할

이 프로세스에서 활용하는 **다양한 테스트 유형**:

### 정적 테스트
```bash
# Lint 테스트
npm run lint

# 라이선스 테스트  
npm audit --audit-level moderate

# TypeScript 타입 체크
npm run type-check
```

### 동적 테스트
```bash
# Unit 테스트
npm run test

# E2E 테스트
npm run test:e2e

# 커버리지 테스트
npm run test:cov
```

**테스트코드가 명확하다는 것은 스펙이 명확하다는 것**이다. TDD를 통해 요구사항을 코드로 먼저 표현하고, 이를 만족하는 구현을 작성하면 자연스럽게 스펙이 명확해진다.

**Flutter BLoC 패턴의 TDD 장점**:
- **State 중심 설계**: API 응답 구조를 그대로 State로 모델링하여 일관성 확보
- **비즈니스 로직 분리**: UI와 로직이 완전히 분리되어 테스트 작성이 용이
- **예측 가능한 상태 변화**: 모든 State 전환을 테스트로 검증 가능
- **위젯 테스트 단순화**: State만 Mock하면 UI의 모든 시나리오 테스트 가능

## 실무 적용 팁

### 1. 팀 간 협업 개선

```markdown
프론트엔드/Flutter 팀과의 협업:
- 1단계 완료 후 Swagger 명세 공유
- Mock Server 활용으로 병렬 개발 가능
- API 변경 시 Swagger 명세 먼저 수정 후 알림
- Flutter State 설계를 API 응답 구조 기반으로 통일

QA 팀과의 협업:
- 백엔드 E2E 테스트 케이스를 QA 시나리오 기반으로 작성
- Flutter Widget 테스트로 UI 상태별 시나리오 검증
- Swagger 문서를 테스트 케이스 작성 기준으로 활용
```

### 2. 단계별 검증 포인트

```markdown
1단계 검증: 비즈니스 로직과 API 설계 일치 여부
2단계 검증: 생성된 백엔드 코드의 구조적 정합성
3단계 검증: 백엔드 모든 엣지 케이스에 대한 테스트 커버리지
4단계 검증: 
  - 백엔드: 실제 HTTP 요청/응답 정상 동작
  - Flutter: State 전환 및 UI 렌더링 정상 동작
5단계 검증: 문서 자동 생성 정상 여부
6단계 검증: 원본 설계와 구현 결과 일치 여부
```

### 3. 자동화 도구 활용

**백엔드 (NestJS)**:
```bash
# package.json scripts
{
  "scripts": {
    "api-design": "swagger-codegen generate -i swagger.yaml -l typescript-nestjs",
    "test:unit": "jest --testPathPattern=spec.ts",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "docs:generate": "ts-node scripts/generate-docs.ts",
    "docs:diff": "swagger-diff swagger.yaml dist/swagger.json"
  }
}
```

**프론트엔드 (Flutter)**:
```bash
# Makefile 또는 scripts
flutter_tests:
	flutter test --coverage
	flutter test integration_test/

flutter_code_gen:
	swagger-codegen generate -i swagger.yaml -l dart-dio
	flutter packages pub run build_runner build

flutter_bloc_test:
	flutter test test/bloc/ --coverage
	flutter test test/widgets/ 

# pubspec.yaml dev_dependencies
dev_dependencies:
  bloc_test: ^9.1.0
  mocktail: ^0.3.0
  flutter_test:
    sdk: flutter
```

## 기존 방식 vs API-First Development

| 구분 | 기존 방식 | API-First Development |
|------|-----------|---------------|
| **시작점** | 코드 작성 | API 설계 |
| **문서화** | 나중에 정리 | 처음부터 정확 |
| **팀 협업** | 구현 완료 후 | 설계 단계부터 |
| **백엔드 테스트** | 수동으로 확인 | 자동화된 검증 |
| **Flutter 개발** | Provider 직접 구현 | BLoC State 기반 TDD |
| **UI 테스트** | 수동 시나리오 확인 | State별 자동 위젯 테스트 |
| **변경 관리** | 코드 → 문서 불일치 | 명세 → 코드 일치 |
| **품질 보장** | 경험 의존 | 체계적 검증 |

## 마무리

실제로 이 프로세스를 도입한 프로젝트에서는 아래와 같은 장점들이 있다:
- **API 문서와 구현 불일치**: 거의 0%로 감소
- **프론트엔드 통합 이슈**: 80% 이상 사전 방지
- **테스트 커버리지**: 자연스럽게 70% 이상 달성
- **Flutter UI 버그**: State 기반 테스트로 대부분 사전 발견
- **신규 팀원 온보딩**: Swagger 문서만으로도 빠른 이해 가능

이 프로세스는 **한 번 정착시키면 팀의 기본 문화**가 된다. API 설계 → 테스트 작성 → 구현 → 검증이라는 흐름이 자연스러워지면, 놀랍게도 전체 개발 속도와 품질이 동시에 향상된다.