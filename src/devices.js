// All profiles are EMULATED (viewport, DPR, touch, user-agent) in Chromium. None is a physical device.
const A=m=>`Mozilla/5.0 (Linux; Android 14; ${m}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36`;
const I=(os,k)=>`Mozilla/5.0 (${k}; CPU ${os} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1`;
const W='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const d=(label,w,h,dpr,touch,ua,family)=>({label,w,h,dpr,touch,ua,family,emulated:true,engine:'Chromium'});
module.exports={
 'galaxy-s24':d('Samsung Galaxy S24',360,780,3,true,A('SM-S921B'),'Android'),
 'galaxy-a54':d('Samsung Galaxy A54',412,915,2.6,true,A('SM-A546B'),'Android'),
 'pixel-8':d('Google Pixel 8',412,915,2.625,true,A('Pixel 8'),'Android'),
 'xiaomi-14':d('Xiaomi 14',393,873,2.75,true,A('2311DRK48G'),'Android'),
 'redmi-note-13':d('Redmi Note 13',393,873,2.75,true,A('23129RAA4G'),'Android'),
 'iphone-15':d('iPhone 15',393,852,3,true,I('iPhone OS 17_5','iPhone'),'Apple'),
 'iphone-15-pro':d('iPhone 15 Pro',393,852,3,true,I('iPhone OS 17_5','iPhone'),'Apple'),
 'iphone-15-pro-max':d('iPhone 15 Pro Max',430,932,3,true,I('iPhone OS 17_5','iPhone'),'Apple'),
 'ipad':d('iPad',820,1180,2,true,I('OS 17_5','iPad'),'Apple'),
 'win10':d('Windows 10 Desktop',1366,768,1,false,W,'Desktop'),
 'win11':d('Windows 11 Desktop',1366,768,1,false,W,'Desktop'), // Chrome reports the same UA on Win10 and Win11
 'macos':d('macOS Desktop',1440,900,2,false,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36','Desktop')
};
