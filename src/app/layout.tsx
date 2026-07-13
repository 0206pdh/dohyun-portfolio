import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DoHyun — Cloud Engineer Portfolio",
  description:
    "AWS와 Kubernetes 기반 인프라를 다루는 Cloud Engineer DoHyun의 프로젝트와 이력을 소개합니다.",
  openGraph: {
    title: "DoHyun — Cloud Engineer Portfolio",
    description:
      "AWS와 Kubernetes 기반 인프라를 다루는 Cloud Engineer DoHyun의 프로젝트와 이력을 소개합니다.",
    type: "website",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary",
    title: "DoHyun — Cloud Engineer Portfolio",
    description:
      "AWS와 Kubernetes 기반 인프라를 다루는 Cloud Engineer DoHyun의 프로젝트와 이력을 소개합니다.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-white text-slate-900">
        {children}
      </body>
    </html>
  );
}
