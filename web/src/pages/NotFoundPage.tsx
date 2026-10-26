import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="notfound">
      <Compass size={28} />
      <h1>页面不存在</h1>
      <p>这个地址没有对应的资源视图。</p>
      <Link className="btn btn-primary" to="/">
        返回概览
      </Link>
    </div>
  );
}
