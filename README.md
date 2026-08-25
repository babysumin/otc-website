# On the Court 웹사이트

회원 명단 + 분기별 회비 관리 웹앱 (Next.js + Supabase)

## 1. Supabase 설정 (데이터베이스)

1. https://supabase.com 에서 무료 가입 → New Project 생성
2. 프로젝트 생성 후 왼쪽 메뉴 "SQL Editor" 클릭
3. `supabase_schema.sql` 파일 내용을 복사해서 붙여넣고 실행 (Run)
4. 왼쪽 메뉴 "Project Settings" → "API" 에서 아래 두 값을 복사해두기
   - Project URL
   - anon public key

## 2. 로컬에서 값 채우기

1. `.env.example` 파일을 복사해서 `.env.local` 파일 만들기
2. 방금 복사한 Supabase URL과 anon key 붙여넣기

```
NEXT_PUBLIC_SUPABASE_URL=여기에 Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=여기에 anon key
```

## 3. GitHub에 올리기

터미널에서 이 폴더로 이동한 뒤:

```bash
git init
git add .
git commit -m "OTC 웹사이트 초기 버전"
git branch -M main
git remote add origin https://github.com/내계정/otc-website.git
git push -u origin main
```

(GitHub에서 먼저 "otc-website" 라는 이름으로 빈 저장소를 만들어두세요 - New repository, README 없이)

## 4. Vercel에 배포

1. Vercel 대시보드 → New Project → Import Git Repository → 방금 만든 저장소 선택
2. "Environment Variables" 항목에 `.env.local`에 넣었던 두 값을 그대로 입력
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
3. Deploy 클릭 → 몇 분 뒤 xxx.vercel.app 주소 생성됨

## 5. 도메인 연결 (선택)

1. 가비아/후이즈 등에서 도메인 구매 (예: onthecourt.kr)
2. Vercel 프로젝트 → Settings → Domains → 도메인 입력
3. Vercel이 알려주는 DNS 값을 도메인 구매처 관리 화면에 등록
4. 보통 몇 분~몇 시간 내 연결 완료

## 로컬에서 미리보기 (선택)

```bash
npm install
npm run dev
```

http://localhost:3000 에서 확인 가능
