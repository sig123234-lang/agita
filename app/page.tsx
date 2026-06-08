import ChatClient from "./chat-client";

// 알파: 로그인 없음. 기본값으로 ChatClient 렌더.
// auth + DB 붙으면 RSC에서 user/companion 로드해 props로 내려줌.
export default function Home() {
  return <ChatClient aiName="온" intensity="다정" />;
}
