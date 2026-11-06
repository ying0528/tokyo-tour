// 行程的補充圖片：寬度跟手機一樣，點一下可以看原圖
import { useEffect, useState } from 'react';
import { useFileUrl } from './useFile.ts';

export function ActImage({ path, blob, alt }: { path?: string; blob?: Blob; alt: string }) {
  const stored = useFileUrl(blob ? null : path);
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setLocal(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  const url = local ?? stored.url;
  if (!url) {
    return <div className="act-img empty">{stored.state === 'offline' ? '沒有網路，這張圖還沒下載到手機' : stored.state === 'loading' ? '載入中…' : '圖片還在上傳中'}</div>;
  }
  return (
    <a className="act-img" href={url} target="_blank" rel="noopener noreferrer">
      <img src={url} alt={alt} />
    </a>
  );
}
