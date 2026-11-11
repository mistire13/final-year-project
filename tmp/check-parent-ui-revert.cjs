const fs=require('node:fs'),path=require('node:path'),ts=require('../frontend/node_modules/typescript');
const original=JSON.parse(fs.readFileSync('tmp/parent-ui-component-inventory.json','utf8')).records;
const differences=[];
for(const old of original){
 const file=path.join('frontend/src',old.file),text=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),counts={},sizes={},controls=[],surfaces=[];
 function walk(node){
  if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
   const tag=node.tagName.getText(ast),attrs=node.attributes.properties.filter(ts.isJsxAttribute),get=name=>attrs.find(a=>a.name.getText(ast)===name)?.initializer?.getText(ast);
   if(['Button','IconButton','Pressable','MotionPressable','Card','TextInput','Field','Switch','Text'].includes(tag))counts[tag]=(counts[tag]||0)+1;
   if(['Button','IconButton','Pressable','MotionPressable','TextInput','Field','Switch'].includes(tag))controls.push({tag,label:get('accessibilityLabel')||get('label')||get('title')||get('placeholder')||null,role:get('accessibilityRole')||null});
   if(tag==='Card')surfaces.push({interactive:!!get('onPress'),tint:get('tint')||'default'});
   if(tag==='Text'&&get('size'))sizes[get('size')]=(sizes[get('size')]||0)+1;
  }ts.forEachChild(node,walk);
 }walk(ast);
 for(const [key,value,expected]of [['counts',counts,old.counts],['textSizes',sizes,old.textSizes],['controls',controls,old.controls.map(({line,...rest})=>rest)],['surfaces',surfaces,old.surfaces.map(({line,...rest})=>rest)]]){
  if(JSON.stringify(value)!==JSON.stringify(expected))differences.push({file:old.file,key,...(key==='textSizes'||key==='counts'?{expected,actual:value}:{expectedCount:expected.length,actualCount:value.length})});
 }
}
console.log(JSON.stringify({inventoryFiles:original.length,differences},null,2));
