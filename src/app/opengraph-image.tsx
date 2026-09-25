import { ImageResponse } from 'next/og';

export const size={width:1200,height:630};
export const contentType='image/png';

export default function OpenGraphImage(){
 return new ImageResponse(
  <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:'#fffefa',color:'#20211f'}}>
   <div style={{display:'flex',alignItems:'center',gap:34}}>
    <svg width="170" height="170" viewBox="0 0 96 96" aria-hidden="true">
     <path d="M22 40C28.6274 40 34 34.6274 34 28C34 21.3726 28.6274 16 22 16C15.3726 16 10 21.3726 10 28C10 34.6274 15.3726 40 22 40Z" fill="#ff6666"/>
     <path d="M67 85C73.6274 85 79 79.6274 79 73C79 66.3726 73.6274 61 67 61C60.3726 61 55 66.3726 55 73C55 79.6274 60.3726 85 67 85Z" fill="#20211f"/>
     <path d="M11.4828 47C10.8635 52.1331 11.3613 57.252 12.9415 62.0016C14.5218 66.7512 17.1467 71.0176 20.6341 74.5051C24.1216 77.9925 28.388 80.6174 33.1376 82.1977C37.8872 83.7779 43.0061 84.2757 48.1392 83.6564" fill="none" stroke="#e7e7e7" strokeWidth="10" strokeLinecap="round"/>
     <path d="M76.6564 54.8333C77.2756 49.7002 76.7779 44.5813 75.1976 39.8317C73.6174 35.0821 70.9925 30.8157 67.505 27.3282C64.0176 23.8408 59.7511 21.2159 55.0016 19.6356C50.252 18.0554 45.1331 17.5576 40 18.1769" fill="none" stroke="#e7e7e7" strokeWidth="10" strokeLinecap="round"/>
    </svg>
    <div style={{display:'flex',fontSize:116,fontWeight:700,letterSpacing:'-6px'}}>roundy</div>
   </div>
  </div>,
  size
 );
}
