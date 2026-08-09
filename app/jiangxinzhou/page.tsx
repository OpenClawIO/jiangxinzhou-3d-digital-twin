import type { Metadata } from "next";
import JiangxinzhouShell from "./JiangxinzhouShell";
import { landmarks } from "./landmarks";
import { pageCopy } from "./locales";
import "./jiangxinzhou.css";

export const metadata: Metadata = {
  title: `${pageCopy.title.zh} | ${pageCopy.title.en}`,
  description: `${pageCopy.title.zh}：${pageCopy.description.zh} / ${pageCopy.description.en}`,
  openGraph: {
    title: `${pageCopy.title.zh} | ${pageCopy.title.en}`,
    description: `${pageCopy.openGraphDescription.zh} / ${pageCopy.openGraphDescription.en}`,
    type: "website",
    images: [{ url: "/og-jiangxinzhou-v2.png", width: 1748, height: 910, alt: "Jiangxinzhou 3D Digital Twin V2" }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${pageCopy.title.zh} | ${pageCopy.title.en}`,
    description: `${pageCopy.openGraphDescription.zh} / ${pageCopy.openGraphDescription.en}`,
    images: ["/og-jiangxinzhou-v2.png"],
  },
};

export default function JiangxinzhouPage() {
  return (
    <main className="jiangxinzhou-page">
      <JiangxinzhouShell landmarks={landmarks} />
      <noscript>{pageCopy.noScript.zh} / {pageCopy.noScript.en}</noscript>
    </main>
  );
}
