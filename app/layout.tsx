import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://jiangxinzhou-3d-digital-twin.vercel.app"),
  title: "南京江心洲3D时空",
  description: "以 WGS84、开放建筑轮廓与多方公开资料交叉核验的江心洲全岛 3D 数字地图。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
