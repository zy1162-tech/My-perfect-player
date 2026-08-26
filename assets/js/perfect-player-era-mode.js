/* Perfect Player V9 — 独立传奇年代模式（2003 / 2010 / 2016） */
(function(global) {
  'use strict';

  var POS = { 1:'PG', 2:'SG', 3:'SF', 4:'PF', 5:'C' };
  var ATTRS = ['threePT','MID','FIN','DNK','HAN','PAS','PDEF','IDEF','BLK','REB','ATH','STR','CLU'];
  var ERA_PLAYABLE_OVR_FLOOR = 70;
  // NBA 正式名单上限为 15 人；传奇年代也统一使用该上限，避免转会/选秀时无意裁掉真实轮换球员。
  var ERA_ROSTER_CAP = 15;
  // 目标赛季相较基础 2K 名单已成长、但仍被保留为低新秀分的少数年轻核心。
  // 采用点名校准，避免把所有潜力新秀都不合理地抬高。
  var ERA_YOUNG_CORE_OPENING_OVR = { 'Stephen Curry':78, 'James Harden':78, 'Russell Westbrook':78 };
  var HISTORICAL_PEAK_OVR = {
    'lebron james':99, 'dwyane wade':97, 'carmelo anthony':94, 'chris bosh':93,
    'kobe bryant':98, 'tim duncan':98, 'kevin garnett':97, 'dirk nowitzki':97,
    'stephen curry':98, 'kevin durant':97, 'russell westbrook':95, 'james harden':96,
    'chris paul':96, 'dwight howard':95, 'kawhi leonard':96, 'paul george':94,
    'derrick rose':94, 'blake griffin':93, 'klay thompson':92, 'draymond green':90,
    'kyrie irving':94, 'damian lillard':94, 'giannis antetokounmpo':98,
    'anthony davis':96, 'jimmy butler':93, 'nikola jokic':98, 'chris webber':94,
    'shaquille o neal':98, 'allen iverson':97, 'jason kidd':95, 'steve nash':96
  };
  // 历史巨星不能套用普通球员“29 岁统一下滑”的模板；primeFloor 只在真实巅峰窗口内生效。
  var HISTORICAL_CAREER_CURVES = {
    'lebron james':{ peak:99, primeStart:23, primeEnd:41, primeFloor:94 },
    'chris webber':{ peak:94, primeStart:25, primeEnd:31, primeFloor:90 },
    'kobe bryant':{ peak:98, primeStart:22, primeEnd:34, primeFloor:94 },
    'tim duncan':{ peak:98, primeStart:22, primeEnd:35, primeFloor:93 },
    'kevin garnett':{ peak:97, primeStart:22, primeEnd:33, primeFloor:93 },
    'dirk nowitzki':{ peak:97, primeStart:23, primeEnd:34, primeFloor:92 },
    'stephen curry':{ peak:98, primeStart:25, primeEnd:36, primeFloor:94 },
    'kevin durant':{ peak:97, primeStart:22, primeEnd:35, primeFloor:94 },
    'dwyane wade':{ peak:97, primeStart:23, primeEnd:31, primeFloor:93 },
    'carmelo anthony':{ peak:94, primeStart:22, primeEnd:30, primeFloor:91 },
    'chris bosh':{ peak:93, primeStart:22, primeEnd:30, primeFloor:90 },
    'chris paul':{ peak:96, primeStart:22, primeEnd:34, primeFloor:92 },
    'dwight howard':{ peak:95, primeStart:21, primeEnd:29, primeFloor:92 },
    'james harden':{ peak:96, primeStart:23, primeEnd:32, primeFloor:92 },
    'russell westbrook':{ peak:95, primeStart:22, primeEnd:31, primeFloor:92 },
    'kawhi leonard':{ peak:96, primeStart:24, primeEnd:32, primeFloor:93 },
    'giannis antetokounmpo':{ peak:98, primeStart:23, primeEnd:32, primeFloor:95 },
    'nikola jokic':{ peak:98, primeStart:24, primeEnd:33, primeFloor:96 },
    // 奥尼尔是统治力极高、但衰退和退役都明显早于詹姆斯的典型；03-04 后应在 2011 年休赛期退出联盟。
    'shaquille o neal':{ peak:98, primeStart:22, primeEnd:31, primeFloor:94, postPrimeDecay:0.9, retireAfterAge:38 },
    'allen iverson':{ peak:97, primeStart:22, primeEnd:30, primeFloor:92 },
    'jason kidd':{ peak:95, primeStart:23, primeEnd:32, primeFloor:90 },
    'steve nash':{ peak:96, primeStart:29, primeEnd:35, primeFloor:92 },
    'amare stoudemire':{ peak:92, primeStart:22, primeEnd:28, primeFloor:88 },
    'carlos boozer':{ peak:86, primeStart:25, primeEnd:30, primeFloor:84 }
  };
  // 已知历史球星按真实生涯末段设定强制退役节点；其余所有球员由核心的固定生涯档案生成节点。
  var HISTORICAL_RETIREMENT_AGE = {
    'lebron james':42, 'chris webber':34, 'kobe bryant':37, 'tim duncan':39, 'kevin garnett':39, 'dirk nowitzki':40,
    'stephen curry':42, 'kevin durant':42, 'dwyane wade':36, 'carmelo anthony':38, 'chris bosh':32, 'chris paul':41,
    'dwight howard':39, 'james harden':41, 'russell westbrook':40, 'kawhi leonard':39, 'giannis antetokounmpo':41,
    'nikola jokic':41, 'shaquille o neal':38, 'allen iverson':35, 'jason kidd':39, 'steve nash':40,
    'amare stoudemire':33, 'carlos boozer':34
  };
  var HISTORICAL_CN_NAMES = {
    'mike james':'迈克-詹姆斯', 'jiri welsch':'伊里-韦尔施', 'eddie robinson':'埃迪-罗宾逊',
    'ronald dupree':'罗纳德-杜普里', 'kevin ollie':'凯文-奥利', 'ira newble':'艾拉-纽贝尔',
    'marquis daniels':'马奎斯-丹尼尔斯', 'earl boykins':'厄尔-博伊金斯',
    'voshon lenard':'沃尚-莱纳德', 'chris andersen':'克里斯-安德森',
    'slava medvedenko':'斯拉瓦-梅德维登科', 'malik allen':'马利克-阿伦',
    'erick strickland':'埃里克-斯特里克兰', 'doug overton':'道格-奥弗顿',
    'dan dickau':'丹-迪考', 'vin baker':'文-贝克', 'glen davis':'格伦-戴维斯',
    'tyson chandler':'泰森-钱德勒', 'paul millsap':'保罗-米尔萨普',
    'isaiah thomas':'以赛亚-托马斯', 'jae crowder':'杰-克劳德',
    'amir johnson':'阿米尔-约翰逊', 'deandre jordan':'德安德烈-乔丹',
    'kent bazemore':'肯特-贝兹莫尔', 'gerald green':'杰拉德-格林',
    // ---- 三个时代核心阵容的补充译名（保证传奇年代全中文，昵称优先）----
    'lebron james':'勒布朗-詹姆斯', 'dwyane wade':'德维恩-韦德', 'carmelo anthony':'卡梅隆-安东尼',
    'chris bosh':'克里斯-波什', 'kobe bryant':'科比-布莱恩特', 'tim duncan':'蒂姆-邓肯',
    'kevin garnett':'凯文-加内特', 'dirk nowitzki':'德克-诺维茨基', 'steve nash':'史蒂夫-纳什',
    'jason kidd':'杰森-基德', 'allen iverson':'阿伦-艾弗森', 'shaquille o neal':'沙奎尔-奥尼尔',
    'yao ming':'姚明', 'tracy mcgrady':'特雷西-麦克格雷迪', 'vince carter':'文斯-卡特',
    'ray allen':'雷-阿伦', 'paul pierce':'保罗-皮尔斯', 'gary payton':'加里-佩顿',
    'karl malone':'卡尔-马龙', 'tony parker':'托尼-帕克', 'manu ginobili':'马努-吉诺比利',
    'david robinson':'大卫-罗宾逊', 'pau gasol':'保罗-加索尔', 'latrell sprewell':'拉特里尔-斯普雷维尔',
    'steve francis':'史蒂夫-弗朗西斯', 'gilbert arenas':'吉尔伯特-阿里纳斯', 'amare stoudemire':'阿马雷-斯塔德迈尔',
    'carlos boozer':'卡洛斯-布泽尔', 'deron williams':'德隆-威廉姆斯', 'michael redd':'迈克尔-里德',
    'jermaine oneal':'杰梅因-奥尼尔', 'rashard lewis':'拉沙德-刘易斯', 'andre iguodala':'安德烈-伊戈达拉',
    'kevin love':'凯文-乐福', 'derrick rose':'德里克-罗斯', 'blake griffin':'布雷克-格里芬',
    'stephen curry':'斯蒂芬-库里', 'kevin durant':'凯文-杜兰特', 'russell westbrook':'拉塞尔-威斯布鲁克',
    'james harden':'詹姆斯-哈登', 'klay thompson':'克莱-汤普森', 'draymond green':'追梦格林',
    'kyrie irving':'凯里-欧文', 'kawhi leonard':'科怀-伦纳德', 'paul george':'保罗-乔治',
    'giannis antetokounmpo':'扬尼斯-阿德托昆博', 'anthony davis':'安东尼-戴维斯',
    'jimmy butler':'吉米-巴特勒', 'damian lillard':'达米安-利拉德', 'dwight howard':'德怀特-霍华德',
    'chris paul':'克里斯-保罗', 'demarcus cousins':'德马库斯-考辛斯', 'karl anthony towns':'卡尔-安东尼-唐斯',
    'joel embiid':'乔尔-恩比德', 'kristaps porzingis':'克里斯塔普斯-波尔津吉斯',
    'dangelo russell':'德安杰洛-拉塞尔', 'jahlil okafor':'贾利尔-奥卡福', 'ben simmons':'本-西蒙斯',
    'brandon ingram':'布兰登-英格拉姆', 'jaylen brown':'杰伦-布朗', 'jamal murray':'贾马尔-默里',
    'jayson tatum':'杰森-塔图姆', 'lonzo ball':'朗佐-鲍尔', 'markelle fultz':'马克尔-富尔茨',
    'john wall':'约翰-沃尔', 'jrue holiday':'朱-霍勒迪', 'marc gasol':'马克-加索尔',
    'zach randolph':'扎克-兰多夫', 'tony allen':'托尼-阿伦', 'mike conley':'迈克-康利',
    'lamarcus aldridge':'拉马库斯-阿尔德里奇', 'goran dragic':'戈兰-德拉季奇', 'hassan whiteside':'哈桑-怀特塞德',
    'kemba walker':'肯巴-沃克', 'nicola jokic':'尼古拉-约基奇',
    // ---- 名单数据中的截断名/别名补全 ----
    'metta world':'慈世平', 'metta world peace':'慈世平', 'ron artest':'罗恩-阿泰斯特',
    'nick van':'尼克-范埃克塞尔', 'nick van exel':'尼克-范埃克塞尔',
    'keith van':'基思-范霍恩', 'keith van horn':'基思-范霍恩'
  };
  var ERA_ROOKIE_FIRST = ['亚伦','布兰登','卡梅伦','德文','埃文','加文','杰伦','凯登','马库斯','诺兰','泰勒','韦斯利'];
  var ERA_ROOKIE_LAST = ['安德森','贝克','卡特','戴维斯','埃利斯','福斯特','格兰特','哈里斯','杰克逊','刘易斯','米勒','帕克','里德','斯科特','特纳','沃克','杨'];
  var LAKERS_2003_F4 = [
    { nameEn:'Gary Payton', nameCn:'加里-佩顿', pos:'PG/SG', age:35, ovr:87, ratingSource:'2003-04 湖人当季老将校准',
      attrs:{threePT:78,MID:85,FIN:76,DNK:45,HAN:91,PAS:90,PDEF:88,IDEF:65,BLK:40,REB:60,ATH:77,STR:70,CLU:88} },
    { nameEn:'Karl Malone', nameCn:'卡尔-马龙', pos:'PF/C', age:40, ovr:84, ratingSource:'2003-04 湖人当季老将校准',
      attrs:{threePT:48,MID:86,FIN:88,DNK:70,HAN:73,PAS:79,PDEF:78,IDEF:84,BLK:68,REB:86,ATH:72,STR:94,CLU:88} }
  ];
  // 2016-17 赛季真实名单修正：2015-16（2K16）基础名单在开局前对齐 2016 年休赛期的人员变动。
  // 值为 null 表示该球员在 2016 年夏天退役/离开联盟；值为球队代码表示转会去向。
  var ERA_2017_ROSTER_PATCH = {
    // —— 2016 年夏天退役/离开联盟 ——
    'Kobe Bryant': null,
    'Tim Duncan': null,
    'Kevin Garnett': null,
    'Mo Williams': null,
    'Jimmer Fredette': null,      // 赴海外
    'Amar\'e Stoudemire': null,   // 退役
    // —— 2016 休赛期知名转会 ——
    'Kevin Durant': 'GSW',
    'Dwyane Wade': 'CHI',
    'Derrick Rose': 'NYK',
    'Joakim Noah': 'NYK',
    'Rajon Rondo': 'CHI',
    'Al Horford': 'BOS',
    'Pau Gasol': 'SAS',
    'Chandler Parsons': 'MEM',
    'Harrison Barnes': 'DAL',
    'Andrew Bogut': 'DAL',
    'Zaza Pachulia': 'GSW',
    'Serge Ibaka': 'ORL',
    'Victor Oladipo': 'OKC',
    'Ersan Ilyasova': 'PHI',      // 雷霆→76人（奥拉迪波交易后续）
    'Domantas Sabonis': 'OKC',    // 选秀夜交易（由选秀夜修正处理）
    'Evan Turner': 'POR',
    'Jeff Teague': 'IND',
    'Luol Deng': 'LAL',
    'Timofey Mozgov': 'LAL',
    'David West': 'GSW',
    'Jeremy Lin': 'BKN',
    'Jared Sullinger': 'TOR',
    'Eric Gordon': 'HOU',
    'Ryan Anderson': 'HOU',
    'Festus Ezeli': 'POR',
    'Marreese Speights': 'LAC',
    'Courtney Lee': 'NYK',
    'Robin Lopez': 'CHI',
    'Bismack Biyombo': 'ORL',
    'Terrence Jones': 'NOP',
    'Raymond Felton': 'LAC',
    // —— 2016 休赛期其他知名转会 ——
    'Dwight Howard': 'ATL',
    'Matthew Dellavedova': 'MIL',
    'Gerald Green': 'BOS',
    'Dion Waiters': 'MIA',
    'Willie Reed': 'MIA',
    'Luke Babbitt': 'MIA',
    'Roy Hibbert': 'CHA',
    'Ramon Sessions': 'CHA',
    'Isaiah Canaan': 'CHI',
    'Justin Holiday': 'NYK',
    'Arron Afflalo': 'SAC',
    'Langston Galloway': 'NOP',
    'Derrick Williams': 'MIA',
    'Kevin Séraphin': 'IND',
    'José Calderón': 'CHI',
    'Jerian Grant': 'CHI',
    'Ty Lawson': 'SAC',
    'George Hill': 'UTA',
    'Ian Mahinmi': 'WAS',
    'Al Jefferson': 'IND',
    'Aaron Brooks': 'IND',
    'Michael Beasley': 'MIL',
    'Leandro Barbosa': 'PHX',
    'Matt Barnes': 'SAC',
    'Chris Andersen': 'CLE',
    'James Ennis III': 'MEM',
    'Jared Dudley': 'PHX',
    'Cole Aldrich': 'MIN',
    'Jordan Hill': 'MIN',
    'Brandon Rush': 'MIN',
    'Solomon Hill': 'NOP',
    'E\'Twaun Moore': 'NOP',
    'Dewayne Dedmon': 'SAS',
    'David Lee': 'SAS',
    'Boban Marjanović': 'DET',
    'Jon Leuer': 'DET',
    'Ish Smith': 'DET',
    'Jeff Green': 'ORL',
    'D.J. Augustin': 'ORL',
    'Gerald Henderson': 'PHI',
    'Sergio Rodríguez': 'PHI',
    'Seth Curry': 'DAL',
    'Nene Hilario': 'HOU',
    'Jason Smith': 'WAS',
    'Trevor Booker': 'BKN'
  };
  // 2016-17 缺失的真实球员补充。
  var ERA_2017_ADDITIONS = [
    { nameEn:'Wilson Chandler', nameCn:'威尔森-钱德勒', pos:'SF', team:'DEN', age:29, ovr:74 },
    { nameEn:'Juancho Hernangómez', nameCn:'胡安乔-埃尔南戈麦斯', pos:'PF', team:'DEN', age:21, ovr:62 },
    { nameEn:'Dario Šarić', nameCn:'达里奥-沙里奇', pos:'PF', team:'PHI', age:22, ovr:70 },
    { nameEn:'Patrick McCaw', nameCn:'帕特里克-麦考', pos:'SG', team:'GSW', age:21, ovr:64 },
    { nameEn:'Ivica Zubac', nameCn:'伊维察-祖巴茨', pos:'C', team:'LAL', age:19, ovr:60 },
    { nameEn:'Willy Hernangomez', nameCn:'威利-埃尔南戈麦斯', pos:'C', team:'NYK', age:22, ovr:64 },
    { nameEn:'Mindaugas Kuzminskas', nameCn:'明道加斯-库兹明斯卡斯', pos:'SF', team:'NYK', age:27, ovr:62 },
    { nameEn:'Timothe Luwawu', nameCn:'蒂莫泰-卢瓦乌', pos:'SG', team:'PHI', age:21, ovr:63 }
  ];
  // 2016 届选秀夜交易修正。
  var ERA_2017_DRAFT_NIGHT = {
    'Marquese Chriss': 'PHX',
    'Domantas Sabonis': 'OKC',
    'Taurean Prince': 'ATL',
    'Caris LeVert': 'BKN',
    'Damian Jones': 'GSW',
    'Malachi Richardson': 'SAC',
    'Denzel Valentine': 'CHI',
    'Deyonta Davis': 'MEM',
    'Thon Maker': 'MIL'
  };
  // 2003-04 赛季真实名单修正：2K3（2002-03）基础名单在开局前对齐 2003 年休赛期的人员变动。
  var ERA_2004_ROSTER_PATCH = {
    // —— 2003 年夏天退役/离队 ——
    'David Robinson': null,
    'John Stockton': null,          // 退役
    'Karl Malone': null,            // 转投湖人（由 F4 补丁加入）
    'Gary Payton': 'LAL',           // 雄鹿→湖人 F4；不能再额外生成第二个佩顿
    'Arvydas Sabonis': null,        // 退役
    // 注：CHA（夏洛特山猫）2004 年才成立，2003-04 赛季不存在；为保持 30 队结构，
    // 其占位名单（真实球员但年份不同）原样保留，不在此处理。
    // —— 2003 休赛期知名转会 ——
    'Gilbert Arenas': 'WAS',
    'Antawn Jamison': 'DAL',
    'Nick Van': 'GSW',              // 范埃克塞尔随贾米森交易前往勇士
    'Latrell Sprewell': 'MIN',      // 森林狼三头怪
    'Sam Cassell': 'MIN',
    'Kevin Ollie': 'CLE',
    'Voshon Lenard': 'DEN',
    'Mark Jackson': 'HOU',
    'Hedo Türkoğlu': 'SAS',         // 国王→马刺（米勒三方交易）
    'Scot Pollard': 'IND',
    'Brad Miller': 'SAC',
    'Keith Van': 'NYK',             // 基思-范霍恩 76人→尼克斯
    'Jason Kapono': 'CLE',
    'Keith Bogans': 'ORL',
    'Matt Carroll': 'POR'
  };
  // 2003-04 缺失的真实球员补充（名单数据里没有、但当年真实存在的球员）。
  var ERA_2004_ADDITIONS = [
    { nameEn:'Darko Miličić', nameCn:'达科-米利西奇', pos:'C', team:'DET', age:18, ovr:65 },
    { nameEn:'Kyle Korver', nameCn:'凯尔-科沃尔', pos:'SG', team:'PHI', age:22, ovr:72 },
    { nameEn:'Udonis Haslem', nameCn:'乌杜尼斯-哈斯勒姆', pos:'PF', team:'MIA', age:23, ovr:68 },
    { nameEn:'Zoran Planinić', nameCn:'佐兰-普拉尼尼奇', pos:'PG', team:'BKN', age:21, ovr:64 },
    { nameEn:'Francisco Elson', nameCn:'弗朗西斯科-埃尔森', pos:'C', team:'DEN', age:27, ovr:66 },
    { nameEn:'Ira Newble', nameCn:'艾拉-纽贝尔', pos:'SF', team:'CLE', age:28, ovr:67 }
  ];
  // 选秀夜交易修正：选秀班次按"选秀前球队"登记，开局前移回真实球队。
  var ERA_2004_DRAFT_NIGHT = {
    'Leandro Barbosa': 'PHX',   // 马刺选中→太阳
    'Kendrick Perkins': 'BOS',  // 灰熊选中→凯尔特人
    'Marcus Banks': 'BOS'       // 灰熊选中→凯尔特人
  };
  // 2010-11 赛季真实名单修正：2K10（2009-10）基础名单在开局前对齐 2010 年休赛期的人员变动。
  var ERA_2011_ROSTER_PATCH = {
    // —— 2010 年夏天（詹姆斯"决定"）——
    'LeBron James': 'MIA',
    'Chris Bosh': 'MIA',
    'Zydrunas Ilgauskas': 'MIA',
    'Shaquille O\'Neal': 'BOS',
    'Jermaine O\'Neal': 'BOS',
    'Carlos Boozer': 'CHI',
    'Amare Stoudemire': 'NYK',
    'David Lee': 'GSW',
    'Al Jefferson': 'UTA',
    'Raja Bell': 'UTA',
    'Corey Maggette': 'MIL',
    'Anthony Morrow': 'BKN',
    'Tyson Chandler': 'DAL',
    'Leandro Barbosa': 'TOR',
    'Hedo Turkoglu': 'PHX',
    'Marcus Camby': 'POR',
    'Steve Blake': 'LAL',
    'Matt Barnes': 'LAL',
    // —— 2010 休赛期其他知名转会 ——
    'Kirk Hinrich': 'WAS',
    'John Salmons': 'MIL',
    'Tony Allen': 'MEM',
    'Travis Outlaw': 'BKN',
    'Drew Gooden': 'MIL',
    'Jordan Farmar': 'BKN',
    'Keyon Dooling': 'MIL',
    'Johan Petro': 'BKN',
    'Tracy McGrady': 'DET',
    'Erick Dampier': 'MIA',
    'Linas Kleiza': 'TOR',
    'Dan Gadzuric': 'GSW',
    'Charlie Bell': 'GSW',
    'Luke Ridnour': 'MIN',
    'Dorell Wright': 'GSW',
    'Courtney Lee': 'HOU',
    'Darren Collison': 'IND',
    'James Posey': 'IND',
    'Roger Mason': 'NYK',
    'Samuel Dalembert': 'SAC',
    'Spencer Hawes': 'PHI',
    'Andrés Nocioni': 'PHI',
    'Wesley Matthews': 'POR',
    'Kyle Korver': 'CHI',
    'C.J. Watson': 'CHI',
    'Ronnie Brewer': 'CHI',
    'Randy Foye': 'LAC',
    'Willie Green': 'NOP',
    'Jason Smith': 'NOP',
    'Hasheem Thabeet': 'HOU',
    'Marco Belinelli': 'NOP',
    'Luther Head': 'SAC',
    // —— 2010-11 不在 NBA 的球员（赴海外）——
    'Allen Iverson': null,
    'Rafer Alston': null
  };
  // 2010-11 缺失的真实球员补充。
  var ERA_2011_ADDITIONS = [
    { nameEn:'Anthony Morrow', nameCn:'安东尼-莫罗', pos:'SG', team:'BKN', age:25, ovr:70 },
    { nameEn:'Timofey Mozgov', nameCn:'季莫费-莫兹戈夫', pos:'C', team:'NYK', age:24, ovr:66 },
    { nameEn:'Landry Fields', nameCn:'兰德里-菲尔兹', pos:'SG', team:'NYK', age:22, ovr:66 },
    { nameEn:'Tiago Splitter', nameCn:'蒂亚戈-斯普利特', pos:'C', team:'SAS', age:26, ovr:68 },
    { nameEn:'Ramon Sessions', nameCn:'拉蒙-塞申斯', pos:'PG', team:'CLE', age:24, ovr:70 },
    { nameEn:'Ian Mahinmi', nameCn:'伊安-马辛米', pos:'C', team:'DAL', age:24, ovr:60 },
    { nameEn:'Jeremy Lin', nameCn:'林书豪', pos:'PG', team:'GSW', age:22, ovr:62 },
    { nameEn:'Omer Asik', nameCn:'欧米尔-阿西克', pos:'C', team:'CHI', age:24, ovr:62 }
  ];
  // 2010 届选秀夜交易修正。
  var ERA_2011_DRAFT_NIGHT = {
    'Jordan Crawford': 'WAS',
    'Luke Babbitt': 'POR',
    'Trevor Booker': 'WAS',
    'Lazar Hayward': 'MIN',
    'Damion James': 'BKN',
    'Kevin Seraphin': 'WAS'
  };
  // 转会球员"当季到位总评"：部分球员的基础名单总评低于其目标赛季的真实水平，
  // 到位时按此值修正，避免被 12 人裁人机制误裁（如 61 分的科沃尔被 62 分的阿西克挤掉）。
  var ERA_ARRIVAL_OVR = {
    'Kyle Korver': 72,  // 2010-11 公牛：真实轮换射手
    'Gary Payton': 87   // 2003-04 湖人：F4 当季老将校准
  };
  /** 时代名单"前移一年"：全联盟 +1 岁，并按真实休赛期名单修正表移动/移除球员。 */
  function applyEraSeasonShift(patchTable) {
    NBA2K_TEAMS.forEach(function(team) {
      (NBA2K_DATA[team] || []).forEach(function(p) {
        // F4 老将（佩顿/马龙）的年龄已按 2003-04 当季校准，不再 +1。
        if (p && typeof p._age === 'number' && !p._eraF4SeasonAdjusted) p._age++;
      });
    });
    Object.keys(patchTable || {}).forEach(function(patchKey) {
      var target = patchTable[patchKey];
      var normKey = nameKey(patchKey);
      var fromTeam = null, player = null;
      NBA2K_TEAMS.some(function(team) {
        var roster = NBA2K_DATA[team] || [];
        var idx = roster.findIndex(function(p) { return p && nameKey(p.nameEN || p.name) === normKey; });
        if (idx >= 0) {
          fromTeam = team;
          // 修正表偶尔会包含“原队就是目标队”的校正项（例如 2010 的坎比仍在开拓者）。
          // 此时不能先 splice，否则会把球员无声删掉。
          if (target !== null && fromTeam === target) { player = roster[idx]; return true; }
          player = roster.splice(idx, 1)[0];
          return true;
        }
        return false;
      });
      if (!player) return;
      if (target === null) {
        // 退役：移出名单并记录（避免 40 岁的科比/邓肯继续出现在联盟）。
        player._eraShiftRetired = true;
        STATE._leagueChanges = STATE._leagueChanges || {};
        STATE._leagueChanges.retired = STATE._leagueChanges.retired || [];
        STATE._leagueChanges.retired.push({ name: player.cname || player.name, nameEN: player.name, ovr: player.ovr, team: fromTeam, age: player._age, eraShift: true });
        return;
      }
      if (NBA2K_TEAMS.indexOf(target) < 0 || fromTeam === target) return;
      player._eraShiftMoved = true;
      if (ERA_ARRIVAL_OVR && ERA_ARRIVAL_OVR[patchKey] != null) {
        player.ovr = Number(ERA_ARRIVAL_OVR[patchKey]) || player.ovr;
      }
      replaceWeakest(target, player);
    });
  }
  /** 缺失真实球员补充：makePlayer 生成后入队（15 人上限自动替换最弱者）。 */
  function applyEraAdditions(start, additions) {
    (additions || []).forEach(function(row) {
      var player = makePlayer(row, { age: row.age, ovr: row.ovr, draftYear: start });
      player._eraAddition = true;
      replaceWeakest(row.team, player);
    });
  }
  /** 选秀夜交易修正：选秀班次按"选秀前球队"登记，开局前把新秀移到真实球队（须在 addDraftClass 之后）。 */
  function applyEraDraftNight(table) {
    Object.keys(table || {}).forEach(function(key) {
      var target = table[key];
      var normKey = nameKey(key);
      var fromTeam = null, player = null;
      NBA2K_TEAMS.some(function(team) {
        var roster = NBA2K_DATA[team] || [];
        var idx = roster.findIndex(function(p) { return p && nameKey(p.nameEN || p.name) === normKey; });
        if (idx >= 0) { fromTeam = team; player = roster.splice(idx, 1)[0]; return true; }
        return false;
      });
      if (!player || !target || NBA2K_TEAMS.indexOf(target) < 0 || fromTeam === target) return;
      replaceWeakest(target, player);
    });
  }
  var TEMPLATES = {
    PG:{threePT:76,MID:78,FIN:76,DNK:55,HAN:87,PAS:86,PDEF:73,IDEF:50,BLK:38,REB:49,ATH:80,STR:50,CLU:78},
    SG:{threePT:80,MID:80,FIN:80,DNK:69,HAN:81,PAS:70,PDEF:72,IDEF:54,BLK:43,REB:52,ATH:81,STR:56,CLU:78},
    SF:{threePT:73,MID:77,FIN:82,DNK:78,HAN:77,PAS:67,PDEF:75,IDEF:68,BLK:57,REB:66,ATH:82,STR:69,CLU:76},
    PF:{threePT:57,MID:72,FIN:83,DNK:78,HAN:68,PAS:60,PDEF:72,IDEF:78,BLK:72,REB:78,ATH:74,STR:80,CLU:73},
    C:{threePT:42,MID:67,FIN:85,DNK:79,HAN:61,PAS:56,PDEF:63,IDEF:82,BLK:82,REB:85,ATH:67,STR:85,CLU:71}
  };

  function data() { return global.__PP_ERA_MODE_DATA__ || { roster2003:{}, draftClasses:{} }; }
  function completeRosters() { return global.__PP_COMPLETE_ERA_ROSTERS__ || {}; }
  function presentationPlayers() {
    return global.__PP_ERA_PRESENTATION__ && global.__PP_ERA_PRESENTATION__.players || {};
  }
  // 展示资源必须保留 Jr./Sr./II/III/IV；球队/生涯身份匹配仍继续使用旧 nameKey。
  function presentationKey(value) {
    return String(value || '').replace(/amar['’]e/ig, 'amare').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, '');
  }
  function presentationFor(name) {
    var key = presentationKey(name);
    var source = presentationPlayers()[key] || {};
    var verifiedLocal = typeof global.resolveVerifiedLocalPlayerHeadshot === 'function' ? global.resolveVerifiedLocalPlayerHeadshot(name) : '';
    var cnFixes = global.__PP_ERA_PRESENTATION_CN_FIXES__ || {};
    return { c:cnFixes[key] || source.c || '', p:verifiedLocal || source.p || '', u:source.u || '', i:source.i || 0 };
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(Number(v) || lo))); }
  /** 2003/2010/2016 纪元均以次年赛季开局（纪元年 N = N 年夏天开始的 N-(N+1) 赛季）。 */
  function eraAgeOffset(start) { return [2003, 2010, 2016].indexOf(Number(start)) >= 0 ? 1 : 0; }
  function mainPos(value) {
    var p = POS[value] || String(value || 'SF').split('/')[0].trim();
    return TEMPLATES[p] ? p : 'SF';
  }
  function normalizedPositions(value) {
    if (POS[value]) return POS[value];
    var positions = String(value || 'SF').split(/\s*[\/-]\s*/).filter(function(pos, idx, all) {
      return !!TEMPLATES[pos] && all.indexOf(pos) === idx;
    });
    return positions.length ? positions.join('/') : 'SF';
  }
  function peakOvrFor(row, currentOvr, age) {
    var key = nameKey(row && (row.nameEn || row.nameEN || row.name));
    var curve = HISTORICAL_CAREER_CURVES[key];
    var exact = (curve && curve.peak) || HISTORICAL_PEAK_OVR[key];
    if (exact) return Math.max(Number(currentOvr) || 0, exact);
    var potential = Math.max(0, Number(row && row.potential) || 0);
    // 未收录峰值的历史球员也按年龄留出成长空间：19 岁约 +11，22 岁约 +9，25 岁约 +7，27 岁约 +5，30 岁约 +3。
    var ageRoom = Math.max(2, Math.min(12, 13 - Math.max(0, Number(age) - 18) * 0.85));
    return clamp((Number(currentOvr) || 65) + Math.max(potential, ageRoom), Number(currentOvr) || 50, 96);
  }
  function careerCurveFor(row) {
    return HISTORICAL_CAREER_CURVES[nameKey(row && (row.nameEn || row.nameEN || row.name))] || null;
  }
  // 基础 2K 名单有时比目标赛季早一年，少数年轻核心会保留过低的新秀分数。
  // 只校准名单中明确列出的球员，普通新秀与其他历史球员仍保留原始赛季数据。
  function applyYoungStarOpeningFloor() {
    NBA2K_TEAMS.forEach(function(team) {
      (NBA2K_DATA[team] || []).forEach(function(player) {
        var floor = ERA_YOUNG_CORE_OPENING_OVR[player && (player.nameEN || player.name)];
        if (!player || !player._eraRoster || !floor || Number(player._age) > 22 || Number(player.ovr) >= floor) return;
        var before = Math.max(1, Number(player.ovr) || 1);
        var ratio = floor / before;
        ATTRS.forEach(function(attr) {
          if (player[attr] != null) player[attr] = clamp(Number(player[attr]) * ratio, 25, 99);
        });
        player._sourceOvr = Number(player._sourceOvr) || Number(player.ovr) || 0;
        player.ovr = floor;
        player._ratingBalanceAdjusted = true;
        player._youngStarOpeningFloor = true;
        player._ratingSource = (player._ratingSource || '时代数值校准') + ' · 年轻核心开局校准';
      });
    });
  }
  function normalizeTeam(team) {
    return ({ SEA:'OKC', NJN:'BKN', NOH:'NOP', NOK:'NOP', CHH:'CHA', VAN:'MEM' })[team] || team;
  }
  function generatedAttrs(pos, ovr) {
    pos = mainPos(pos);
    var base = TEMPLATES[pos];
    var delta = (Number(ovr) || 70) - 76;
    var out = {};
    ATTRS.forEach(function(key, idx) {
      var positionBias = ((idx * 7 + String(pos).charCodeAt(0)) % 5) - 2;
      out[key] = clamp(base[key] + delta * 0.72 + positionBias, 30, 97);
    });
    return out;
  }
  function adjustedEraOvr(row, requested) {
    var raw = Number(requested != null ? requested : row.ovr) || 50;
    if (row.ratingOfficial) return Math.max(ERA_PLAYABLE_OVR_FLOOR, raw);
    var mpg = Number(row.seasonLine && row.seasonLine.mpg) || 0;
    var roleFloor = mpg >= 26 ? 66 : (mpg >= 18 ? 62 : (mpg >= 10 ? 58 : 55));
    return Math.max(ERA_PLAYABLE_OVR_FLOOR, raw, roleFloor);
  }
  function makePlayer(row, options) {
    options = options || {};
    var pos = normalizedPositions(row.pos);
    var requestedOvr = options.ovr != null ? options.ovr : row.ovr;
    var ovr = clamp(adjustedEraOvr(row, requestedOvr), 50, 99);
    var curve = careerCurveFor(row);
    var attrs = row.attrs ? Object.assign({}, row.attrs) : generatedAttrs(mainPos(pos), ovr);
    var nameEn = row.nameEn || ('Era Player ' + Math.random());
    var presentation = presentationFor(nameEn);
    var p = {
      name: nameEn,
      nameEN: nameEn,
      cname: (row.nameCn && /[\u3400-\u9fff]/.test(row.nameCn)) ? row.nameCn : (presentation.c || row.nameCn || nameEn),
      pos: pos,
      ovr: ovr,
      type: ovr >= 88 ? '历史球星' : (ovr >= 78 ? '时代主力' : '时代球员'),
      _age: clamp(options.age != null ? options.age : row.age, 18, 41),
      _eraRoster: true,
      _draftYear: options.draftYear || row.draftYear || null,
      _potential: Number(row.potential) || 6,
      _peakOvr: peakOvrFor(row, ovr, Number(options.age != null ? options.age : row.age) || 22),
      _primeStartAge: curve && curve.primeStart || null,
      _primeEndAge: curve && curve.primeEnd || null,
      _primeFloorOvr: curve && curve.primeFloor || null,
      _postPrimeDecay: curve && curve.postPrimeDecay || null,
      _historicalRetireAge: (curve && curve.retireAfterAge) || HISTORICAL_RETIREMENT_AGE[nameKey(nameEn)] || null,
      contract: 1 + ((nameEn.length + ovr) % 4),
      _ratingSource: row.ratingSource || '时代数值校准',
      _ratingOfficial: !!row.ratingOfficial,
      _sourceOvr: Number(requestedOvr) || 0,
      _ratingBalanceAdjusted: ovr > (Number(requestedOvr) || 0),
      _seasonLine: row.seasonLine || null,
      // 真实年代球员优先使用身份校验后的统一索引；避免空/错误旧路径遮住有效头像。
      photoLocal: presentation.p || '',
      photoUrl: row.photoUrl || presentation.u || '',
      nbaId: Number(row.nbaId || row.nbaID || presentation.i) || 0,
      photoSource: row.photoSource || (presentation.p ? 'selected-era-headshot' : (presentation.u ? 'era-headshot-remote' : '')),
      photoStatus: row.photoStatus || (presentation.p ? 'cached' : '')
    };
    ATTRS.forEach(function(key) { p[key] = clamp(attrs[key], 25, 99); });
    if (row.threePT != null) p.threePT = clamp(row.threePT, 25, 99);
    if (row.DNK != null) p.DNK = clamp(row.DNK, 25, 99);
    return p;
  }
  function nameKey(value) {
    return String(value || '').replace(/amar['’]e/ig, 'amare').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function buildLocalizedNameMap() {
    var map = {};
    var tokens = {};
    function harvest(player) {
      if (!player) return;
      var english = player.nameEn || player.nameEN || player.name;
      var localized = player.nameCn || player.cname;
      if (english && localized && localized !== english && !/[A-Za-z]/.test(localized)) {
        map[nameKey(english)] = localized;
        var enParts = String(english).replace(/\b(jr|sr|ii|iii|iv)\.?\b/ig, '').trim().split(/[\s-]+/);
        var cnParts = String(localized).split(/[·\-\s]+/).filter(Boolean);
        if (enParts.length === cnParts.length) {
          enParts.forEach(function(part, idx) {
            var token = nameKey(part).replace(/\s+/g, '');
            if (token && cnParts[idx]) tokens[token] = cnParts[idx];
          });
        }
      }
    }
    Object.keys(global.NBA2K_DATA || {}).forEach(function(team) {
      if (Array.isArray(NBA2K_DATA[team])) NBA2K_DATA[team].forEach(harvest);
    });
    Object.keys(data().roster2003 || {}).forEach(function(team) { (data().roster2003[team] || []).forEach(harvest); });
    Object.keys(data().draftClasses || {}).forEach(function(year) { (data().draftClasses[year] || []).forEach(harvest); });
    Object.keys(presentationPlayers()).forEach(function(key) {
      var display = presentationFor(key).c;
      if (display && /[\u3400-\u9fff]/.test(display)) map[key] = display;
    });
    // 手动译名表最后覆盖，保证昵称（如 追梦格林）与时代球星译名优先于现役自动收割结果。
    Object.keys(HISTORICAL_CN_NAMES).forEach(function(key) { map[key] = HISTORICAL_CN_NAMES[key]; });
    map._tokens = tokens;
    return map;
  }
  function localizeFromTokens(english, tokens) {
    var suffix = /\b(jr)\.?$/i.test(String(english || '')) ? '小' : '';
    var parts = String(english || '').replace(/\b(jr|sr|ii|iii|iv)\.?\b/ig, '').trim().split(/[\s-]+/).filter(Boolean);
    var localized = parts.map(function(part) { return tokens[nameKey(part).replace(/\s+/g, '')]; });
    if (!localized.length || localized.some(function(part) { return !part; })) return '';
    if (suffix && localized.length) localized[localized.length - 1] = suffix + localized[localized.length - 1];
    return localized.join('-');
  }
  function replaceWeakest(team, player) {
    var roster = NBA2K_DATA[team] || (NBA2K_DATA[team] = []);
    var duplicate = roster.some(function(p) { return p && String(p.name).toLowerCase() === String(player.name).toLowerCase(); });
    if (duplicate) return false;
    // NBA 正式名单上限：超过 15 人才裁掉最弱的非玩家球员。
    if (roster.length >= ERA_ROSTER_CAP) {
      var weakest = -1;
      roster.forEach(function(p, idx) {
        // 已知会成长为巨星的年轻历史球员不能因为开局补人时的低初始评分被误裁（如 2010 库里）。
        var protectedProspect = p && p._eraRoster && Number(p._peakOvr) >= 90;
        if (p && !p._isUser && !protectedProspect && (weakest < 0 || Number(p.ovr) < Number(roster[weakest].ovr))) weakest = idx;
      });
      // 极端情况下全队都是受保护球员，仍需保持 15 人上限。
      if (weakest < 0) roster.forEach(function(p, idx) {
        if (p && !p._isUser && (weakest < 0 || Number(p.ovr) < Number(roster[weakest].ovr))) weakest = idx;
      });
      if (weakest >= 0) roster.splice(weakest, 1);
    }
    roster.push(player);
    return true;
  }
  function apply2003LakersF4() {
    if (Number(STATE.eraStart) !== 2003) return;
    LAKERS_2003_F4.forEach(function(row) {
      var roster = NBA2K_DATA.LAL || (NBA2K_DATA.LAL = []);
      var existing = roster.find(function(player) { return nameKey(player.nameEN || player.name) === nameKey(row.nameEn); });
      if (existing) {
        // 佩顿由雄鹿流转到湖人时，按 F4 当季数值重新校准，而不是保留 2K3 雄鹿峰值卡。
        if (Number(existing.ovr) > Number(row.ovr)) {
          var ratio = Number(row.ovr) / Math.max(1, Number(existing.ovr));
          ATTRS.forEach(function(attr) { if (existing[attr] != null) existing[attr] = clamp(Number(existing[attr]) * ratio, 25, 99); });
          existing.ovr = row.ovr;
        }
        existing._eraF4SeasonAdjusted = true;
        return;
      }
      var player = makePlayer(row, { age:row.age, ovr:row.ovr, draftYear:2003 });
      player._eraF4SeasonAdjusted = true;
      replaceWeakest('LAL', player);
    });
  }
  function repair2003LakersF4Rating(player) {
    if (Number(STATE.eraStart) !== 2003 || !player) return false;
    var key = nameKey(player.nameEN || player.name);
    var row = LAKERS_2003_F4.find(function(item) { return nameKey(item.nameEn) === key; });
    if (!row) return false;
    var age = Math.max(row.age, Number(player._age) || row.age);
    var seasonCap = Math.max(ERA_PLAYABLE_OVR_FLOOR, row.ovr - Math.max(0, age - row.age) * 1.5);
    if (Number(player.ovr) <= seasonCap) return false;
    var ratio = seasonCap / Math.max(1, Number(player.ovr) || 1);
    ATTRS.forEach(function(attr) {
      if (player[attr] != null) player[attr] = clamp(Number(player[attr]) * ratio, 25, 99);
    });
    player.ovr = Math.round(seasonCap);
    player._eraF4SeasonAdjusted = true;
    return true;
  }
  // 旧存档可能已经保存了“湖人 F4 佩顿 + 基础雄鹿佩顿”两份同名球员；只保留 F4 的正确版本。
  function repair2003GaryPaytonDuplicate() {
    if (Number(STATE.eraStart) !== 2003) return 0;
    var found = [];
    Object.keys(NBA2K_DATA || {}).forEach(function(team) {
      if (!Array.isArray(NBA2K_DATA[team])) return;
      NBA2K_DATA[team].forEach(function(player, idx) {
        if (player && nameKey(player.nameEN || player.name) === 'gary payton') found.push({ team:team, idx:idx, player:player });
      });
    });
    if (found.length <= 1) return 0;
    // 湖人是 2003-04 F4 佩顿的唯一正确开局归属；优先它，避免旧档的标记被错误复制时保错一份。
    var keeper = found.find(function(item) { return item.team === 'LAL'; }) || found.find(function(item) { return item.player._eraF4SeasonAdjusted; }) || found[0];
    var removed = 0;
    found.filter(function(item) { return item !== keeper; }).sort(function(a, b) { return b.idx - a.idx; }).forEach(function(item) {
      var roster = NBA2K_DATA[item.team] || [];
      if (roster[item.idx] === item.player) { roster.splice(item.idx, 1); removed++; }
    });
    return removed;
  }
  function repairLegendEraPositions(start) {
    start = Number(start || STATE.eraStart);
    if (STATE.mode !== 'legend' || !start) return 0;
    var base = completeRosters()[String(start)] || completeRosters()[start] || {};
    var localizedNames = buildLocalizedNameMap();
    var historicalRowsByName = {};
    var historicalMetaByName = {};
    Object.keys(base).forEach(function(team) {
      (base[team] || []).forEach(function(row) {
        var key = nameKey(row.nameEn);
        historicalRowsByName[key] = row;
        historicalMetaByName[key] = { row:row, team:team, anchorYear:start, anchorAge:Number(row.age) || 27 };
      });
    });
    Object.keys(data().draftClasses || {}).forEach(function(year) {
      (data().draftClasses[year] || []).forEach(function(row) {
        var key = nameKey(row.nameEn);
        if (!historicalRowsByName[key]) {
          historicalRowsByName[key] = row;
          historicalMetaByName[key] = {
            row:row,
            team:normalizeTeam(row.team),
            anchorYear:Number(year),
            anchorAge:Number(row.age) || (row.birth ? Number(year) - Number(row.birth) : 20)
          };
        }
      });
    });
    var repaired = 0;
    var overdueHistoricalRetirees = [];
    var activeNames = {};
    var elapsed = Number(STATE.career && STATE.career.seasonCount || 0);
    var currentYear = start + elapsed;
    Object.keys(NBA2K_DATA || {}).forEach(function(team) {
      if (!Array.isArray(NBA2K_DATA[team])) return;
      var rowsByName = {};
      (base[team] || []).forEach(function(row) { rowsByName[nameKey(row.nameEn)] = row; });
      (NBA2K_DATA[team] || []).forEach(function(player) {
        if (!player || player._isUser) return;
        var key = nameKey(player.nameEN || player.name);
        activeNames[key] = true;
        var row = rowsByName[key] || historicalRowsByName[key];
        var meta = historicalMetaByName[key];
        var curve = row && careerCurveFor(row);
        var historical = row && normalizedPositions(row.pos);
        if (historical && player.pos !== historical) {
          player.pos = historical;
          repaired++;
        }
        if (row && !player._peakOvr) player._peakOvr = peakOvrFor(row, player.ovr, player._age);
        if (meta) {
          var expectedAge = Math.max(18, Math.min(49, Number(meta.anchorAge) + eraAgeOffset(start) + Math.max(0, currentYear - Number(meta.anchorYear))));
          if (Number(player._age) !== expectedAge || player._eraAgeRepairVersion !== 10) {
            player._age = expectedAge;
            player._eraAgeRepairVersion = 10;
            repaired++;
          }
        }
        if (Number(player.ovr) < ERA_PLAYABLE_OVR_FLOOR) {
          var floorRatio = ERA_PLAYABLE_OVR_FLOOR / Math.max(1, Number(player.ovr) || 1);
          ATTRS.forEach(function(attr) {
            if (player[attr] != null) player[attr] = clamp(Number(player[attr]) * floorRatio, 25, 99);
          });
          player._sourceOvr = Number(player._sourceOvr) || Number(player.ovr) || 0;
          player.ovr = ERA_PLAYABLE_OVR_FLOOR;
          player._ratingBalanceAdjusted = true;
          repaired++;
        }
        if (curve) {
          player._peakOvr = Math.max(Number(player._peakOvr) || 0, Number(curve.peak) || 0);
          player._primeStartAge = curve.primeStart;
          player._primeEndAge = curve.primeEnd;
          player._primeFloorOvr = curve.primeFloor;
          player._postPrimeDecay = curve.postPrimeDecay || null;
          player._historicalRetireAge = curve.retireAfterAge || HISTORICAL_RETIREMENT_AGE[key] || null;
          var playerAge = Number(player._age) || 0;
          // 巅峰保底只在 31 岁前硬生效；31 岁后允许自然衰退（与 evolveLeague 软地板一致）。
          if (playerAge >= curve.primeStart && playerAge <= Math.min(curve.primeEnd, 31) && Number(player.ovr) < curve.primeFloor) {
            var restoreRatio = curve.primeFloor / Math.max(1, Number(player.ovr) || 1);
            ATTRS.forEach(function(attr) {
              if (player[attr] != null) player[attr] = clamp(Number(player[attr]) * restoreRatio, 25, 99);
            });
            player.ovr = curve.primeFloor;
            player._eraPrimeRatingRepaired = true;
          }
          // 只对有明确史实退役节点的球员生效；旧档读入时也会清掉不应继续存在的版本。
          var retirementAge = Number(curve.retireAfterAge) || Number(HISTORICAL_RETIREMENT_AGE[key]) || 0;
          if (retirementAge && playerAge > retirementAge) overdueHistoricalRetirees.push({ team:team, player:player });
        }
        var presentation = presentationFor(player.nameEN || player.name);
        if (!player.cname || player.cname === player.name || player.cname === player.nameEN || !/[\u3400-\u9fff]/.test(player.cname)) {
          player.cname = presentation.c || localizedNames[key] || localizeFromTokens(player.nameEN || player.name, localizedNames._tokens || {}) || player.cname;
        }
        if (!player._eraGenerated) {
          if (!player.photoLocal && presentation.p) player.photoLocal = presentation.p;
          if (!player.photoUrl && presentation.u) player.photoUrl = presentation.u;
          if (!player.nbaId && presentation.i) player.nbaId = presentation.i;
          if (presentation.p && !player.photoSource) player.photoSource = 'selected-era-headshot';
          if (presentation.p && !player.photoStatus) player.photoStatus = 'cached';
        }
        if (player.photoSource === 'generated-rookie-pool' || /^Rookie_/i.test(String(player.name || ''))) {
          localizeEraGeneratedPlayer(player, start + Number(STATE.career && STATE.career.seasonCount || 0));
        }
        repair2003LakersF4Rating(player);
      });
    });
    overdueHistoricalRetirees.forEach(function(item) {
      var roster = NBA2K_DATA[item.team] || [];
      var index = roster.indexOf(item.player);
      if (index >= 0) { roster.splice(index, 1); repaired++; }
    });
    // 早期版本把旧存档中的历史年龄推算错后，可能已让小斯/布泽尔在巅峰期被误退役。
    // 在他们真实 NBA 生涯结束年龄之前，仅做一次有针对性的补回；不会复活正常退役的老将。
    ['amare stoudemire', 'carlos boozer'].forEach(function(key) {
      var meta = historicalMetaByName[key];
      if (!meta || activeNames[key]) return;
      var expectedAge = Number(meta.anchorAge) + eraAgeOffset(start) + Math.max(0, currentYear - Number(meta.anchorYear));
      if (expectedAge > 33 || !meta.team || NBA2K_TEAMS.indexOf(meta.team) < 0) return;
      var curve = careerCurveFor(meta.row);
      var sourceOvr = Math.max(ERA_PLAYABLE_OVR_FLOOR, Number(meta.row.ovr) || ERA_PLAYABLE_OVR_FLOOR);
      var riseYears = Math.max(1, Number(curve && curve.primeStart) - Number(meta.anchorAge));
      var progress = Math.min(1, Math.max(0, expectedAge - Number(meta.anchorAge)) / riseYears);
      var projectedOvr = curve ? sourceOvr + (curve.peak - sourceOvr) * progress : sourceOvr;
      if (curve && expectedAge > curve.primeEnd) projectedOvr -= (expectedAge - curve.primeEnd) * 1.25;
      var restored = makePlayer(meta.row, { age:expectedAge, ovr:clamp(projectedOvr, ERA_PLAYABLE_OVR_FLOOR, curve && curve.peak || 96), draftYear:meta.anchorYear });
      restored._prematureRetirementRestored = true;
      restored._eraAgeRepairVersion = 10;
      if (replaceWeakest(meta.team, restored)) repaired++;
    });
    repaired += repair2003GaryPaytonDuplicate();
    if (repaired && typeof clearLineupCache === 'function') clearLineupCache();
    return repaired;
  }
  global.repairLegendEraPositions = repairLegendEraPositions;
  function localizeEraGeneratedPlayer(player, year) {
    STATE._eraRookieSeq = (Number(STATE._eraRookieSeq) || 0) + 1;
    var seq = STATE._eraRookieSeq;
    var first = ERA_ROOKIE_FIRST[(seq * 5 + year) % ERA_ROOKIE_FIRST.length];
    var last = ERA_ROOKIE_LAST[(seq * 7 + year) % ERA_ROOKIE_LAST.length];
    player.name = 'Era_Prospect_' + year + '_' + seq;
    player.nameEN = 'Era Prospect ' + year + '-' + seq;
    player.cname = first + '-' + last;
    player._eraRoster = true;
    player._eraGenerated = true;
    player._draftYear = Number(year) || null;
    player._peakOvr = player._peakOvr || clamp((Number(player.ovr) || 68) + 5 + (seq % 7), 68, 92);
    player.photoSource = 'era-generated-rookie';
    // 虚构新秀只使用稳定姓名缩写，旧档即使误带真人字段也在修复时清除。
    player.photoLocal = '';
    player.photoUrl = '';
    player.nbaId = 0;
    player.photoStatus = 'generated-initials';
    return player;
  }
  function generateEraRookie(team, year) {
    year = Number(year) || (Number(STATE.eraStart) + Number(STATE.career && STATE.career.seasonCount || 0));
    var positions = ['PG','SG','SF','PF','C'];
    var seq = (Number(STATE._eraRookieSeq) || 0) + 1;
    var pos = positions[(seq + year) % positions.length];
    var ovr = ERA_PLAYABLE_OVR_FLOOR + ((seq * 7 + year) % 7);
    var player = makePlayer({
      nameEn:'Era Prospect ' + year + '-' + seq,
      nameCn:'年代新秀', pos:pos, ovr:ovr, potential:5 + (seq % 8), ratingSource:'传奇年代虚构新秀（联盟下限 70）'
    }, { age:19 + (seq % 3), ovr:ovr, draftYear:year });
    localizeEraGeneratedPlayer(player, year);
    player._enterYear = year;
    player.type = '新秀';
    return player;
  }
  function addDraftClass(year, elapsed, recordChanges, draftNight) {
    var rows = data().draftClasses[String(year)] || [];
    if (!rows.length) return 0;
    // 选秀夜交易修正：班次按"选秀前球队"登记，开局入队时直接落到真实球队，
    // 避免先占位再移走导致误裁原队球员（如塞拉芬占公牛名额挤掉科沃尔）。
    var dnNorm = null;
    if (draftNight) {
      dnNorm = {};
      Object.keys(draftNight).forEach(function(k) { dnNorm[nameKey(k)] = draftNight[k]; });
    }
    var added = 0;
    rows.forEach(function(row, idx) {
      var team = normalizeTeam(row.team) || NBA2K_TEAMS[idx % NBA2K_TEAMS.length];
      if (dnNorm) {
        var dest = dnNorm[nameKey(row.nameEn || row.name)];
        if (dest) team = dest;
      }
      if (NBA2K_TEAMS.indexOf(team) < 0) team = NBA2K_TEAMS[idx % NBA2K_TEAMS.length];
      var years = Math.max(0, Number(elapsed) || 0);
      var growth = Math.min(Number(row.potential) || 6, years * 1.7);
      var ovr = clamp((Number(row.rating) || ERA_PLAYABLE_OVR_FLOOR) + growth, ERA_PLAYABLE_OVR_FLOOR, 96);
      var age = row.birth ? year + years - Number(row.birth) : (Number(row.age) || 20) + years;
      var player = makePlayer(row, { ovr:ovr, age:age, draftYear:year });
      if (replaceWeakest(team, player)) {
        added++;
        if (recordChanges) {
          STATE._leagueChanges = STATE._leagueChanges || {};
          STATE._leagueChanges.rookies = STATE._leagueChanges.rookies || [];
          STATE._leagueChanges.rookies.push({ name:player.cname, team:team, historical:true, draftYear:year });
        }
      }
    });
    return added;
  }

  function syncLegendEraState(start) {
    STATE.draftMode = 'historical';
    if (STATE.career) {
      STATE.career.flags = STATE.career.flags || {};
      STATE.career.flags.legendEraStart = start;
      STATE.career.flags.legendEraLabel = ({ 2003:'2003 白金一代', 2010:'2010 吾皇登基纪元', 2016:'2016-17 巨星合体纪元' })[start] || (start + ' 传奇年代');
    }
  }

  function isHistoricalActive() {
    var start = Number(STATE.eraStart);
    return STATE.mode === 'legend' && [2003, 2010, 2016].indexOf(start) >= 0 && Number(STATE._legendLeagueApplied) === start;
  }

  function getSpinTeams() {
    // NBA2K_TEAMS 由基础数据脚本以顶层 const 暴露，不会成为 window 属性。
    var teams = typeof NBA2K_TEAMS !== 'undefined' && Array.isArray(NBA2K_TEAMS) ? NBA2K_TEAMS : [];
    return teams.filter(function(team) {
      return Array.isArray(NBA2K_DATA[team]) && NBA2K_DATA[team].length > 0;
    });
  }

  global.applyLegendEraLeague = function() {
    if (STATE.mode !== 'legend' || !STATE.eraStart) return;
    var start = Number(STATE.eraStart);
    if (STATE._legendLeagueApplied === start) {
      syncLegendEraState(start);
      repairLegendEraPositions(start);
      return;
    }
    var base = completeRosters()[String(start)] || completeRosters()[start] || {};
    var localizedNames = buildLocalizedNameMap();
    NBA2K_TEAMS.forEach(function(team) {
      var rows = base[team] || [];
      var roster = rows.map(function(row) {
        var enriched = Object.assign({}, row);
        var presentation = presentationFor(enriched.nameEn);
        enriched.nameCn = (enriched.nameCn && /[\u3400-\u9fff]/.test(enriched.nameCn))
          ? enriched.nameCn
          : (presentation.c || localizedNames[nameKey(enriched.nameEn)] || localizeFromTokens(enriched.nameEn, localizedNames._tokens || {}) || enriched.nameEn);
        return makePlayer(enriched, { age:Number(row.age) || 27, ovr:Number(row.ovr) || 65, draftYear:start });
      });
      NBA2K_DATA[team] = roster;
    });
    applyYoungStarOpeningFloor();
    // 2003 的马龙先会在休赛期流转表中移出原队，必须在流转后补入湖人，不能提前加入又被移除。
    if (start !== 2003) apply2003LakersF4();
    // 2003 纪元以 2003-04 赛季开局：名单整体 +1 岁、按真实 2003 休赛期人员变动修正、
    // 缺失真实球员补充、2003 届新秀直接进入名单（含选秀夜交易修正）；之后的选秀从 2004 届开始。
    if (start === 2003) {
      applyEraSeasonShift(ERA_2004_ROSTER_PATCH);
      apply2003LakersF4();
      applyEraAdditions(2003, ERA_2004_ADDITIONS);
      addDraftClass(2003, 0, false, ERA_2004_DRAFT_NIGHT);
      applyEraDraftNight(ERA_2004_DRAFT_NIGHT);
      STATE._eraFirstDraftYear = 2004;
    }
    // 2010 纪元以 2010-11 赛季开局：名单整体 +1 岁、按真实 2010 休赛期人员变动修正
    // （詹姆斯/波什加盟热火等）、缺失球员补充、2010 届新秀（沃尔/考辛斯等）直接进入名单；
    // 之后的选秀从 2011 届开始。
    if (start === 2010) {
      applyEraSeasonShift(ERA_2011_ROSTER_PATCH);
      applyEraAdditions(2010, ERA_2011_ADDITIONS);
      addDraftClass(2010, 0, false, ERA_2011_DRAFT_NIGHT);
      applyEraDraftNight(ERA_2011_DRAFT_NIGHT);
      STATE._eraFirstDraftYear = 2011;
    }
    // 2016 纪元以 2016-17 赛季开局：名单整体 +1 岁、按真实 2016 休赛期人员变动修正、
    // 缺失球员补充、2016 届新秀直接进入名单（含选秀夜交易修正）；之后的选秀从 2017 届开始。
    if (start === 2016) {
      applyEraSeasonShift(ERA_2017_ROSTER_PATCH);
      applyEraAdditions(2016, ERA_2017_ADDITIONS);
      addDraftClass(2016, 0, false, ERA_2017_DRAFT_NIGHT);
      applyEraDraftNight(ERA_2017_DRAFT_NIGHT);
      STATE._eraFirstDraftYear = 2017;
    }
    STATE._legendLeagueApplied = start;
    syncLegendEraState(start);
    if (typeof clearLineupCache === 'function') clearLineupCache();
    // 时代名单是运行时生成的，补挂一次官方头像解析（现役/历史名字都能走 NBA CDN 或本地缓存）。
    if (typeof attachOfficialPlayerHeadshots === 'function') {
      try { attachOfficialPlayerHeadshots(); } catch (e) {}
    }
  };

  global.showLegendEraPicker = function() {
    var old = document.getElementById('legend-era-picker');
    if (old) old.remove();
    var overlay = document.createElement('div');
    overlay.className = 'team-picker-overlay legend-era-picker-overlay';
    overlay.id = 'legend-era-picker';
    overlay.innerHTML = '<div class="team-picker-modal legend-era-picker-modal">' +
      '<div class="team-picker-header"><span>🏆 选择传奇年代</span><button class="modal-close" id="legend-era-close">✕</button></div>' +
      '<div class="legend-era-picker-intro">现役生涯会完整保留。传奇年代每队最多 15 人；有原始 2K 数值的球员采用对应版本评分，其余依当季数据校准。</div>' +
      '<div class="legend-era-picker-grid">' +
        '<button class="legend-era-card" data-era="2003"><span class="legend-era-year">2003</span><span class="legend-era-copy"><strong>白金新章</strong><em>报纸 · 电台 · 早期论坛</em><small>从传统巨星林立的时代起步，面对一届新人涌入联盟后的全新秩序。</small></span></button>' +
        '<button class="legend-era-card" data-era="2010"><span class="legend-era-year">2010</span><span class="legend-era-copy"><strong>聚光灯时代</strong><em>电视辩论 · 社交媒体 · 球星联手</em><small>转会风暴重塑格局，每一次选择都会被放大成全国话题。</small></span></button>' +
        '<button class="legend-era-card" data-era="2016"><span class="legend-era-year">2016</span><span class="legend-era-copy"><strong>空间革命</strong><em>移动舆论 · 三分潮 · 无限换防</em><small>节奏与空间改变球场，短视频和数据也在改变球员的声望。</small></span></button>' +
      '</div></div>';
    document.body.appendChild(overlay);
    document.getElementById('legend-era-close').onclick = function() { overlay.remove(); };
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    overlay.querySelectorAll('[data-era]').forEach(function(btn) {
      btn.onclick = function() {
        STATE.mode = 'legend';
        STATE.eraStart = Number(btn.getAttribute('data-era'));
        STATE.draftMode = 'historical';
        overlay.remove();
        startGame();
      };
    });
  };

  var originalProcessDraft = global.processDraft;
  global.processDraft = function() {
    if (STATE.mode !== 'legend' || !STATE.eraStart) return originalProcessDraft.apply(this, arguments);
    var year = Number(STATE.eraStart) + Number(STATE.career && STATE.career.seasonCount || 0);
    var firstDraftYear = Number(STATE._eraFirstDraftYear || STATE.eraStart);
    if (year < firstDraftYear) return; // 开局名单已包含该届新秀（2016 纪元已含 2016 届）
    if (!data().draftClasses[String(year)] || !data().draftClasses[String(year)].length) {
      var order = (global.NBA2K_TEAMS || []).slice();
      STATE._leagueChanges = STATE._leagueChanges || {};
      STATE._leagueChanges.rookies = STATE._leagueChanges.rookies || [];
      for (var i = 0; i < order.length; i++) {
        var rookie = generateEraRookie(order[i], year);
        if (replaceWeakest(order[i], rookie)) STATE._leagueChanges.rookies.push({ name:rookie.cname, team:order[i], historical:false, draftYear:year });
      }
      if (typeof clearLineupCache === 'function') clearLineupCache();
      return;
    }
    addDraftClass(year, 0, true);
    if (typeof clearLineupCache === 'function') clearLineupCache();
  };

  global.PP_ERA_MODE = {
    apply:global.applyLegendEraLeague,
    isHistoricalActive:isHistoricalActive,
    getSpinTeams:getSpinTeams,
    addDraftClass:addDraftClass,
    generateRookie:generateEraRookie,
    peakOvrFor:peakOvrFor
  };
})(window);
