from pathlib import Path
import subprocess, json, shutil

root=Path.cwd().resolve()
backup=root/'tmp/parent-ui-revert-backup-20261111'
assert backup.resolve().is_relative_to(root)
backup.mkdir(exist_ok=False)
git=['git','-c',f'safe.directory={root.as_posix()}']
def head(name): return subprocess.check_output(git+['show','HEAD:'+name]).decode('utf-8').replace('\r\n','\n')
def current(name): return (root/name).read_text(encoding='utf-8')
def replace(s,a,b):
 if a not in s: raise ValueError('Missing original span: '+a[:100])
 return s.replace(a,b)
changes={}
def put(name,s): changes[name]=s

records=json.loads((root/'tmp/parent-ui-component-inventory.json').read_text(encoding='utf-8'))['records']
mixed={'screens/home/HomeScreen.tsx','screens/profile/ProfileScreen.tsx','screens/profile/AccountScreens.tsx','screens/profile/ChildProfileScreen.tsx','screens/profile/NativeDailyReport.tsx','screens/reports/ReportsScreen.tsx','screens/finances/ParentBillsScreen.tsx','screens/store/DaycareStoreScreen.tsx','screens/store/ShoppingCartScreen.tsx','screens/store/CheckoutScreen.tsx','screens/store/PaymentVerificationScreen.tsx'}
for row in records:
 name=row['file'].replace('\\','/')
 if not name.startswith('screens/') or name in mixed: continue
 path='frontend/src/'+name
 try: baseline=head(path)
 except subprocess.CalledProcessError: continue # Existing untracked ShopAccess is not ours.
 if current(path)!=baseline: put(path,baseline)
for path in ['frontend/App.tsx','frontend/src/theme/tokens.ts','frontend/src/components/design/Motion.tsx','frontend/src/navigation/RootNavigator.tsx']:
 put(path,head(path))

# Shared styling: retain the package-aware Shop visibility that preceded this cleanup.
path='frontend/src/components/design/System.tsx';s=head(path)
s="import {usePackageFeatures} from '../../context/PackageFeaturesContext';\n"+s
s=replace(s,'  const visibleItems = items || tabsForRole(user?.role);','  const {features}=usePackageFeatures();\n  const visibleItems = (items || tabsForRole(user?.role)).filter(item=>item.name!=="Shop"||features.shop);')
put(path,s)

# Home already had the tuition shortcut and fee banner before our redesign.
path='frontend/src/screens/home/HomeScreen.tsx';s=head(path)
s=replace(s,'import { X } from "phosphor-react-native/src/icons/X";','import { X } from "phosphor-react-native/src/icons/X";\nimport { CreditCard } from "phosphor-react-native/src/icons/CreditCard";')
marker='  ];\n\n  // Dynamic Highlights'
s=replace(s,marker,'''    {
      label: "Tuition",
      Icon: CreditCard,
      bg: "#E8F0FE",
      run: () => navigation.navigate("ChildCareFees"),
    },
'''+marker)
banner='''      {/* Monthly Tuition & Care Fees Card */}
      <Card
        style={{
          marginTop: 20,
          padding: 16,
          backgroundColor: "#F7F9FC",
          borderColor: "#E2E8F0",
          borderWidth: 1,
        }}
      >
        <View style={s.between}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "#EBF3FF",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CreditCard size={22} color="#1E56A0" weight="fill" />
            </View>
            <View style={{ flex: 1 }}>
              <Text size={15} weight="semibold" color="#1E293B">
                Care Fees & Tuition
              </Text>
              <Text size={12} color="#64748B" style={{ marginTop: 2 }}>
                Monthly tuition invoices & verified receipts
              </Text>
            </View>
          </View>
          <Button
            title="Invoices"
            variant="outline"
            onPress={() => navigation.navigate("ChildCareFees")}
            style={{ minHeight: 34, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: "#FFFFFF" }}
          />
        </View>
      </Card>

'''
s=replace(s,'      {/* Highlights Section */}',banner+'      {/* Highlights Section */}')
put(path,s)

# Preserve the already-added history shortcuts on Reports.
path='frontend/src/screens/reports/ReportsScreen.tsx';s=head(path);now=current(path)
s=replace(s,'import { CalendarBlank } from "phosphor-react-native/src/icons/CalendarBlank";','import { CalendarBlank } from "phosphor-react-native/src/icons/CalendarBlank";\nimport { Heart } from "phosphor-react-native/src/icons/Heart";')
a=now.index('      {/* Quick Navigation');b=now.index('      {/* Filter Tabs */}',a)
block=now[a:b]
for label in ['Attendance history','Report archive','Health notices']:
 block=block.replace('          accessibilityRole="button"\n          accessibilityLabel="'+label+'"\n','')
block=block.replace('style={{ minHeight: 44,','style={{').replace('size={14} weight="semibold"','size={12} weight="bold"').replace('size={13} color="#5A6679"','size={10} color="#7E828A"')
s=replace(s,'      {/* Filter Tabs */}',block+'      {/* Filter Tabs */}')
put(path,s)

# Preserve the previously added pickup-status route.
path='frontend/src/screens/profile/ChildProfileScreen.tsx';s=head(path);now=current(path)
a=now.index('            <View style={{ gap: 10, marginTop: 20 }}>');b=now.index('            </View>',a)+len('            </View>')
a0=s.index('            <Button\n              title="View Authorized Pickups"');b0=s.index('            />',a0)+len('            />')
s=s[:a0]+now[a:b]+s[b0:];put(path,s)

# Preserve the package/refund/receipt changes to order history; restore its old UI.
path='frontend/src/screens/profile/AccountScreens.tsx';s=head(path);now=current(path)
s="import {usePackageFeatures} from '../../context/PackageFeaturesContext';\n"+s
s=replace(s,'import { formatMoney } from "../store/catalog";','import { formatMoney } from "../store/catalog";\nimport {paymentProvenanceLabel} from \'../../types/daycarePayments\';')
s=replace(s,'export function OrdersScreen({ navigation }: any) {','export function OrdersScreen({ navigation }: any) {\n  const {features}=usePackageFeatures();')
s=replace(s,'            Browse uniforms, books, diapers, and supplies available in the\n            daycare store.',"            {features.shop?'Browse uniforms, books, diapers, and supplies available in the daycare store.':'Your existing daycare orders and receipts will appear here.'}")
s=replace(s,'          <Button\n            title="Visit Store"\n            onPress={() => navigation.navigate("DaycareStore")}\n          />','          {features.shop&&<Button\n            title="Visit Store"\n            onPress={() => navigation.navigate("DaycareStore")}\n          />}')
a=now.index("          {selectedOrder.payment_status==='paid'&&selectedOrder.payment_method");b=now.index('          <View style={{ marginBottom: 14 }}>',a)
s=replace(s,'          <View style={{ marginBottom: 14 }}>',now[a:b]+'          <View style={{ marginBottom: 14 }}>')
s=s.replace(' (Pay at the daycare)',' (Not settled; check payment options)')
put(path,s)

# The three-card profile menu and management links predate the cleanup.
path='frontend/src/screens/profile/ProfileScreen.tsx';s=head(path);now=current(path)
s="import {usePackageFeatures} from '../../context/PackageFeaturesContext';\n"+s
s=replace(s,'import { CaretRight } from "phosphor-react-native/src/icons/CaretRight";','import { CaretRight } from "phosphor-react-native/src/icons/CaretRight";\nimport { CalendarBlank } from "phosphor-react-native/src/icons/CalendarBlank";\nimport { CreditCard } from "phosphor-react-native/src/icons/CreditCard";')
s=replace(s,'  const { user, logout } = useAuth();','  const { user, logout } = useAuth();\n  const {features}=usePackageFeatures();')
a=s.index('      <Text\n        size={13}\n        color="#747B87"\n        style={{ letterSpacing: 0.8, marginTop: 28, marginBottom: 12 }}\n      >\n        EXPLORE')
b=s.index('      <Button\n        title="Log Out"',a)
section='''      <Text
        size={13}
        color="#747B87"
        style={{ letterSpacing: 0.8, marginTop: 28, marginBottom: 12 }}
      >
        FINANCE & ORDERS
      </Text>
      <Card style={{ paddingVertical: 0 }}>
        <MenuRow
          title="Care Fees & Invoices"
          icon={CreditCard}
          onPress={() => navigation.navigate("ChildCareFees")}
        />
        {features.shop && (
          <MenuRow
            title="Store Orders & Receipts"
            icon={Receipt}
            onPress={() => navigation.navigate("Orders")}
          />
        )}
      </Card>

'''
day=now[now.index('      <Text\n        size={13}\n        color={colors.textSecondary}\n        style={{ letterSpacing: 0.8, marginTop: 28, marginBottom: 12 }}\n      >\n        DAYCARE & SUPPORT'):now.index('      <Button\n        title="Log Out"')]
day=day.replace('color={colors.textSecondary}','color="#747B87"')
s=s[:a]+section+day+s[b:];put(path,s)

# Keep care-fee bank verification, reminders, provenance and prior accessibility fixes.
path='frontend/src/screens/finances/ParentBillsScreen.tsx';s=head(path);now=current(path)
imports='''import BillingReminderPreferences from "./BillingReminderPreferences";
import ReceiptPaymentCard from '../payments/ReceiptPaymentCard';
import {paymentProvenanceLabel} from '../../types/daycarePayments';
import {invoiceIsOverdue} from '../../utils/billingDates';'''
s=replace(s,'import { formatMoney } from "../store/catalog";','import { formatMoney } from "../store/catalog";\n'+imports)
s=replace(s,'  const [activeTab, setActiveTab] = useState<"active" | "paid">("active");','  const [activeTab, setActiveTab] = useState<"active" | "paid">("active");\n  const [bankBill,setBankBill]=useState<number|null>(null);')
s=replace(s,'    <Page title="Care Fees & Receipts" back tabs activeTab="Profile">','    <Page title="Care Fees & Receipts" back tabs activeTab="Profile">\n      <BillingReminderPreferences />')
s=replace(s,"          const isOverdue =\n            b.status !== \"paid\" && String(b.due_date).slice(0,10) < new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Addis_Ababa',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());",'          const isOverdue = invoiceIsOverdue(b.due_date, b.status);')
for tab in ['active','paid']:
 s=replace(s,'        <Pressable\n          onPress={() => setActiveTab("'+tab+'")}', '        <Pressable\n          accessibilityRole="tab"\n          accessibilityState={{selected:activeTab===\''+tab+'\'}}\n          onPress={() => setActiveTab("'+tab+'")}')
s=replace(s,'                  <Pressable\n                    onPress={() => setSelectedReceipt({ receipt: b.payments[0], bill: b })}', '                  <Pressable\n                    accessibilityRole="button"\n                    accessibilityLabel={`View receipt ${b.payments[0].receipt_number}`}\n                    onPress={() => setSelectedReceipt({ receipt: b.payments[0], bill: b })}')
s=replace(s,'                      key={p.id}\n                      onPress=', '                      key={p.id}\n                      accessibilityRole="button"\n                      accessibilityLabel={`View receipt ${p.receipt_number}`}\n                      onPress=')
bankline=next(line for line in now.splitlines() if "Number(b.balance_remaining)>0&&b.status" in line)
s=replace(s,'              {/* If multiple receipts exist */}','              {/* If multiple receipts exist */}\n'+bankline)
s=s.replace('Pay directly at the daycare reception office. Staff will instantly issue an official digital receipt.','Pay directly at reception. Staff record the cash payment and issue a digital receipt.')
s=s.replace('2. Telebirr Mobile Transfer','2. Bank or Telebirr transfer').replace("Send payment to the daycare's merchant/account. Share the transaction reference code with front desk.","Open a bill's bank payment details to see the enabled accounts, exact recipient and amount. Submit the CBE receipt link, or the supported bank or Telebirr reference, after transferring.")
s=s.replace('3. Commercial Bank of Ethiopia (CBE)','3. Check a delayed payment').replace('Transfer via CBE Birr or CBE Mobile Banking. Retain the receipt transaction number for verification.','Reopen the bill to recover your saved proof and status. If checking is unavailable or needs review, contact your daycare. Do not transfer again for the same bill.')
marker='                  <View style={[s.between, { marginBottom: 6 }]}>'+ '\n                    <Text size={12} color="#777">Reference Code:</Text>'
s=replace(s,marker,'                  <Text size={12}>{paymentProvenanceLabel(selectedReceipt.receipt.verification_source)}</Text>\n\n'+marker)
put(path,s)

# Checkout was only recolored by this cleanup. Keep all payment/package logic.
path='frontend/src/screens/store/CheckoutScreen.tsx';s=current(path)
s=s.replace('import { colors } from "../../theme/tokens";\n','')
s=replace(s,'import { useDesign } from "../../context/DesignContext";','import { useDesign } from "../../context/DesignContext";\nimport { artwork } from "../../theme/assets";')
for old,following in [('#8C9199','              ORDER FOR'),('#7A828F','              Qty:'),('#7E8591','                {p.text}')]:
 pos=s.index(following);start=s.rfind('color={colors.textSecondary}',0,pos);assert start>=0
 s=s[:start]+s[start:].replace('color={colors.textSecondary}',f'color="{old}"',1)
put(path,s)

# Keep the preexisting Plus-only cart boundary.
path='frontend/src/screens/store/ShoppingCartScreen.tsx';s=head(path)
s="import ShopAccess from './ShopAccess';\n"+s
s=s.replace('export function ShoppingCartScreen({ navigation }: any) {','function ShoppingCartScreenContent({ navigation }: any) {')
s+='\nexport function ShoppingCartScreen(props:any){return <ShopAccess><ShoppingCartScreenContent {...props}/></ShopAccess>;}\n'
put(path,s)

# Keep the store's already-present history navigation and Plus boundary.
path='frontend/src/screens/store/DaycareStoreScreen.tsx';s=head(path);now=current(path)
s="import ShopAccess from './ShopAccess';\n"+s
s=replace(s,'import { ArrowLeft } from "phosphor-react-native/src/icons/ArrowLeft";','import { ArrowLeft } from "phosphor-react-native/src/icons/ArrowLeft";\nimport { Receipt } from "phosphor-react-native/src/icons/Receipt";')
s=s.replace('export function DaycareStoreScreen({ navigation, route }: any) {','function DaycareStoreScreenContent({ navigation, route }: any) {')
a=s.index('        <View>\n          <IconButton\n            icon={ShoppingCart}');b=s.index('\n      </View>',a)
old=s[a:b]
inner='\n'.join('  '+line for line in old.splitlines())
s=s[:a]+'''        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <IconButton
            icon={Receipt}
            label="My Orders"
            onPress={() => navigation.navigate("Orders")}
          />
'''+inner+'\n        </View>'+s[b:]
a=now.index('      <Pressable\n        accessibilityRole="button"\n        accessibilityLabel="Order history"');b=now.index('      <Text size={22}',a)
block=now[a:b].replace('        accessibilityRole="button"\n        accessibilityLabel="Order history"\n','').replace('style={{ minHeight: 44,','style={{')
s=replace(s,'      <Text size={22}',block+'      <Text size={22}')
s+='\nexport function DaycareStoreScreen(props:any){return <ShopAccess><DaycareStoreScreenContent {...props}/></ShopAccess>;}\n'
put(path,s)

path='frontend/src/portal/PortalGate.web.tsx';put(path,current(path).replace("import '../components/design/parent-ui.css';\n",''))
path='frontend/scripts/phase1-boundaries.test.cjs';put(path,current(path).replace("      if (name.endsWith('/theme/tokens')) return load('../src/theme/tokens.ts', modules, globals);\n",''))

removed=['frontend/src/components/design/AnnouncementPreview.tsx','frontend/src/components/design/parent-ui.css','frontend/src/hooks/useAnnouncementReads.ts','frontend/src/utils/announcements.ts','frontend/src/utils/parentTypography.ts','frontend/src/utils/careProfileSections.ts','frontend/scripts/parent-ui-cleanup.test.cjs','docs/PARENT_UI_CLEANUP_IMPLEMENTATION_PLAN.md','docs/reviews/parent-ui-cleanup-implementation-20261110.md']
# Back up exact current bytes before the first application mutation.
for name in list(changes)+removed:
 p=root/name; assert p.resolve().is_relative_to(root)
 if p.exists():
  target=backup/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
for name,text in changes.items(): (root/name).write_text(text,encoding='utf-8')
for name in removed:
 p=root/name
 if p.exists(): p.unlink()
(backup/'manifest.json').write_text(json.dumps({'restored':list(changes),'removed':removed},indent=2),encoding='utf-8')
print(f'Reverted the parent cleanup in {len(changes)} files; retained earlier business changes and saved a reversible backup.')
