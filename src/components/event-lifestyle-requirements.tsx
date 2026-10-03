import {
  smokingRequirementValues,
  smokingValueLabel,
  type HeightRequirements,
  type SmokingRequirements,
  type SmokingRule,
} from '@/lib/event-requirements';
import { tr, type Locale } from '@/lib/locale';

const genders=['female','male'] as const;
const genderLabel=(gender:'female'|'male',locale:Locale)=>tr(locale,gender==='female'?'Ladies':'Gents',gender==='female'?'여성':'남성');

export function EventLifestyleRequirements({
  height,
  smoking,
  onHeightChange,
  onSmokingChange,
  locale,
}:{
  height:HeightRequirements;
  smoking:SmokingRequirements;
  onHeightChange:(value:HeightRequirements)=>void;
  onSmokingChange:(value:SmokingRequirements)=>void;
  locale:Locale;
}){
 return <>
  <fieldset className="eligibility-requirements height-requirements">
   <legend>{tr(locale,'Height Requirements','키 조건')}</legend>
   <p className="admin-help">{tr(locale,'Optional. Leave both fields blank to allow any height for that group.','선택 사항입니다. 해당 그룹에 키 제한이 없으면 두 칸 모두 비워 두세요.')}</p>
   <div className="admin-two">
    {genders.map(gender=>{
     const rule=height[gender];
     return <div className="requirement-editor" key={gender}>
      <strong>{genderLabel(gender,locale)}</strong>
      <div className="admin-two compact-requirement-inputs">
       <label><span>{tr(locale,'Minimum height (cm)','최소 키 (cm)')}</span><input type="number" min={100} max={250} value={rule.min_cm??''} placeholder={tr(locale,'Any','제한 없음')} onChange={e=>onHeightChange({...height,[gender]:{...rule,min_cm:e.target.value===''?null:Number(e.target.value)}})}/></label>
       <label><span>{tr(locale,'Maximum height (cm)','최대 키 (cm)')}</span><input type="number" min={100} max={250} value={rule.max_cm??''} placeholder={tr(locale,'Any','제한 없음')} onChange={e=>onHeightChange({...height,[gender]:{...rule,max_cm:e.target.value===''?null:Number(e.target.value)}})}/></label>
      </div>
     </div>;
    })}
   </div>
  </fieldset>

  <fieldset className="eligibility-requirements smoking-requirements">
   <legend>{tr(locale,'Smoking Requirements','흡연 조건')}</legend>
   <p className="admin-help">{tr(locale,'Choose allowed smoking habits for each group. Leave unrestricted unless this event specifically requires it.','각 그룹에서 허용할 흡연 습관을 선택하세요. 별도 조건이 없다면 제한 없음으로 두세요.')}</p>
   <div className="admin-two">
    {genders.map(gender=>{
     const rule=smoking[gender];
     return <div className="requirement-editor" key={gender}>
      <label><span>{genderLabel(gender,locale)}</span><select value={rule.mode} onChange={e=>onSmokingChange({...smoking,[gender]:{mode:e.target.value as SmokingRule['mode'],values:[]}})}><option value="all">{tr(locale,'No smoking restriction','흡연 제한 없음')}</option><option value="selected">{tr(locale,'Select allowed habits','허용 습관 선택')}</option></select></label>
      {rule.mode==='selected'&&<div className="smoking-checkboxes" role="group" aria-label={tr(locale,gender==='female'?'Ladies smoking habits':'Gents smoking habits',gender==='female'?'여성 흡연 습관':'남성 흡연 습관')}>
       {smokingRequirementValues.map(value=><label className="check-row" key={value}><input type="checkbox" checked={rule.values.includes(value)} onChange={e=>onSmokingChange({...smoking,[gender]:{mode:'selected',values:e.target.checked?[...rule.values,value]:rule.values.filter(item=>item!==value)}})}/><span>{smokingValueLabel(value,locale)}</span></label>)}
      </div>}
     </div>;
    })}
   </div>
  </fieldset>
 </>;
}
