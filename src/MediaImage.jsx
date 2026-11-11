import React,{useEffect,useState} from 'react';
import {resolveImage,publicAssetUrl} from './media';
export default function MediaImage({src,alt='',...props}){const [url,setUrl]=useState(src?.startsWith('local-media:')?'':publicAssetUrl(src));useEffect(()=>{let active=true;resolveImage(src).then(url=>{if(active)setUrl(url);}).catch(()=>{if(active)setUrl('');});return()=>{active=false;};},[src]);return url?<img src={url} alt={alt} {...props}/>:<span className={'image-placeholder '+(props.className||'')} role="img" aria-label={alt||'Фото не добавлено'}/>;}
