# dohyun-portfolio

Cloud Engineer 포트폴리오 사이트. Next.js(App Router) + TypeScript + Tailwind CSS로 만들었습니다.

## 개발

```bash
npm install
npm run dev
```

http://localhost:3000 에서 확인.

## 콘텐츠 수정

- 프로필/이력/자격증: `src/data/profile.ts`
- 프로젝트: `src/data/projects.ts`
- 프로필 사진: `public/images/`에 이미지를 추가하고 `profile.ts`의 `avatarUrl`을 해당 경로로 변경

## 배포

Vercel에 GitHub 저장소를 연결하면 push 시 자동 배포됩니다.
