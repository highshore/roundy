import { App } from '@/components/app';
export default async function Page({params}:{params:Promise<{path?:string[]}>}) {const {path=[]}=await params;return <App path={path.join('/')} />;}
