'use strict';
const fs=require('node:fs'),path=require('node:path'),ts=require('../frontend/node_modules/typescript');
const root=path.resolve(__dirname,'../frontend/src');
const files=[];
function walk(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const p=path.join(folder,entry.name);if(entry.isDirectory())walk(p);else if(/\.tsx$/.test(p))files.push(p);}}
walk(path.join(root,'screens'));walk(path.join(root,'components/design'));
const relevant=files.filter(p=>!/(StaffScreens|WorkspaceScreen|NativeDailyReport)\.tsx$/.test(p));
const records=[];
for(const file of relevant){
  const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),counts={},controls=[],surfaces=[],sizes={};
  function visit(node){
    if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
      const tag=node.tagName.getText(ast),attrs=node.attributes.properties.filter(ts.isJsxAttribute),get=name=>attrs.find(a=>a.name.getText(ast)===name)?.initializer?.getText(ast);
      if(['Button','IconButton','Pressable','MotionPressable','Card','TextInput','Field','Switch','Text'].includes(tag))counts[tag]=(counts[tag]||0)+1;
      if(['Button','IconButton','Pressable','MotionPressable','TextInput','Field','Switch'].includes(tag))controls.push({tag,line:ast.getLineAndCharacterOfPosition(node.pos).line+1,label:get('accessibilityLabel')||get('label')||get('title')||get('placeholder')||null,role:get('accessibilityRole')||null});
      if(tag==='Card')surfaces.push({line:ast.getLineAndCharacterOfPosition(node.pos).line+1,interactive:!!get('onPress'),tint:get('tint')||'default'});
      if(tag==='Text'&&get('size'))sizes[get('size')]=(sizes[get('size')]||0)+1;
    }
    ts.forEachChild(node,visit);
  }
  visit(ast);records.push({file:path.relative(root,file),counts,textSizes:sizes,controls,surfaces});
}
const output={scope:'Static parent screen/component JSX occurrences; mapped/reusable controls are not runtime button counts',files:records.length,records};
fs.writeFileSync(path.join(__dirname,'parent-ui-component-inventory.json'),JSON.stringify(output,null,2));
const totals={};for(const record of records)for(const [tag,count]of Object.entries(record.counts))totals[tag]=(totals[tag]||0)+count;
console.log(JSON.stringify({files:records.length,totals,rawPressablesRequiringSemanticReview:records.flatMap(r=>r.controls.filter(c=>['Pressable','MotionPressable'].includes(c.tag)&&!c.role).map(c=>({file:r.file,line:c.line}))).length},null,2));
const safe=value=>String(value??'Dynamic or child-derived label').replace(/\r?\n/g,' ').replace(/\|/g,'\\|').slice(0,170);
const link=(r,line)=>`[${r.file.replaceAll('\\','/')}:${line}](<${path.join(root,r.file).replaceAll('\\','/')}:${line}>)`;
const advice={Button:'Shared action scale, contrasting label, disabled/busy/success states.',IconButton:'44px target, specific accessible name, focus/disabled state.',Pressable:'Check semantic role/name, target size, selected state and keyboard access.',MotionPressable:'Check semantic name, target size, pressed/focus feedback and reduced motion.',TextInput:'Persistent label, shared font, required/error state and keyboard behavior.',Field:'Shared field scale, readable placeholder, error/helper state.',Switch:'Clear label, saved/pending/error feedback; preserve real preference state.'};
const md=['# Parent UI component inventory','', '10 November 2026. Static JSX occurrences in 36 parent screen files and 2 shared design files. This is a source inventory, not a count of simultaneously rendered controls or proof every conditional state was clicked. Card maps can produce multiple runtime cards. Missing role attributes flag manual review; they do not by themselves prove an inaccessible control.','', '[Read the prioritized audit and fix proposal](parent-ui-full-audit-and-proposal-20261110.md).','', '## File coverage','', '| File | Buttons | Icon buttons | Raw pressables | Cards | Fields/inputs |','| --- | ---: | ---: | ---: | ---: | ---: |',...records.map(r=>`| ${r.file.replaceAll('\\','/')} | ${r.counts.Button||0} | ${r.counts.IconButton||0} | ${(r.counts.Pressable||0)+(r.counts.MotionPressable||0)} | ${r.counts.Card||0} | ${(r.counts.Field||0)+(r.counts.TextInput||0)} |`),'','## Button, field and switch occurrences','','| Source | Type | Label/expression | Review/fix category |','| --- | --- | --- | --- |',...records.flatMap(r=>r.controls.map(c=>`| ${link(r,c.line)} | ${c.tag} | ${safe(c.label)} | ${advice[c.tag]}${['Pressable','MotionPressable'].includes(c.tag)&&!c.role?' Explicit role not found on this occurrence; inspect its purpose.':''} |`)),'','## Card occurrences','','| Source | Interaction | Tint | Proposed treatment |','| --- | --- | --- | --- |',...records.flatMap(r=>r.surfaces.map(c=>`| ${link(r,c.line)} | ${c.interactive?'Pressable':'Static'} | ${safe(c.tint)} | ${c.interactive?'Use clear action/name and focus treatment; avoid nested buttons.':'Use flat grouping; remove redundant wrapper/shadow where rows suffice.'} |`))];
fs.writeFileSync(path.resolve(__dirname,'../docs/reviews/parent-ui-component-inventory-20261110.md'),md.join('\n')+'\n');
const fontDir=path.resolve(__dirname,'../frontend/node_modules/@expo-google-fonts/quicksand');
function fontFiles(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?fontFiles(path.join(folder,entry.name)):/\.ttf$/.test(entry.name)?[path.join(folder,entry.name)]:[]);}
function hasGlyph(b,code){
  const n=b.readUInt16BE(4);let cmap;
  for(let i=0;i<n;i++){const p=12+i*16;if(b.toString('ascii',p,p+4)==='cmap')cmap=b.readUInt32BE(p+8);}
  if(cmap===undefined)return null;
  for(let i=0;i<b.readUInt16BE(cmap+2);i++){
    const start=cmap+b.readUInt32BE(cmap+4+i*8+4),format=b.readUInt16BE(start);
    if(format===12){const groups=b.readUInt32BE(start+12);for(let j=0;j<groups;j++){const p=start+16+j*12;if(code>=b.readUInt32BE(p)&&code<=b.readUInt32BE(p+4))return b.readUInt32BE(p+8)+code-b.readUInt32BE(p)!==0;}}
    if(format===4&&code<=65535){const segments=b.readUInt16BE(start+6)/2,end=start+14,begin=end+segments*2+2,delta=begin+segments*2,offset=delta+segments*2;for(let j=0;j<segments;j++){if(code<b.readUInt16BE(begin+j*2)||code>b.readUInt16BE(end+j*2))continue;const d=b.readInt16BE(delta+j*2),range=b.readUInt16BE(offset+j*2);if(!range)return ((code+d)&65535)!==0;const pos=offset+j*2+range+(code-b.readUInt16BE(begin+j*2))*2;if(pos<b.length){const glyph=b.readUInt16BE(pos);if(glyph&&((glyph+d)&65535))return true;}}}
  }
  return false;
}
const glyphCoverage=fontFiles(fontDir).map(file=>({font:path.basename(file),latinA:hasGlyph(fs.readFileSync(file),0x41),ethiopicU1200:hasGlyph(fs.readFileSync(file),0x1200),ethiopicU12A0:hasGlyph(fs.readFileSync(file),0x12A0)}));
fs.writeFileSync(path.join(__dirname,'parent-ui-font-coverage.json'),JSON.stringify(glyphCoverage,null,2));console.log(JSON.stringify({fontCoverage:glyphCoverage}));
