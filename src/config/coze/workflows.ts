import type { CozeWorkflow, CozeWorkflowCategory } from '@/types/coze';

/**
 * 工作流分类
 */
export const categories: CozeWorkflowCategory[] = [
  { id: 'all', name: '全部', icon: '📋' },
  { id: '功能', name: '功能', icon: '⚙️' },
  { id: '品宣制作', name: '品宣制作', icon: '📊' },
  { id: '文案策划', name: '文案策划', icon: '🎨' },
  { id: '电商内容', name: '电商内容', icon: '✍️' },
  { id: '自媒体运营', name: '自媒体运营', icon: '🎬' },
];

/**
 * 工作流配置列表
 * 从 coze-workflow-platform 迁移
 */
export const workflows: CozeWorkflow[] = [
  {
    id: '11111',
    name: '零素觉醒平台使用视频教程',
    description: '查看示例视频教程',
    icon: '📋',
    category: '功能',
    coverVideo: 'https://1354453097.vod-qcloud.com/945ed1favodtranssh1354453097/86ab77135145403699919316892/v.f100030.mp4',
    coverImage: '',
    outputFormat: 'text',
    duration: 2,
    balanceCost: 0,
    status: 'active',
    inputs: []
  },
  {
    id: '7579813125329190955',
    name: '一键生成15s创意小故事（参考产品）',
    description: '一键生成15s创意小故事，1080p',
    icon: '🎬',
    category: '自媒体运营',
    coverVideo: 'https://1354453097.vod-qcloud.com/356b5b33vodtranscq1354453097/c71d64a25145403707379044941/v.f100030.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '任意主题', placeholder: '', required: true, defaultValue: '' },
      { key: 'bili', type: 'option', label: '比例', placeholder: '选择：9:16 或 16:9', required: true, defaultValue: '9:16', options: [{ value: '9:16', label: '9:16' }, { value: '16:9', label: '16:9' }] },
      { key: 'production', type: 'image', label: '产品图片', required: true },
      { key: 'details', type: 'image', label: '产品辅助细节图片1', required: false },
      { key: 'details1', type: 'image', label: '产品辅助细节图片2', required: false },
      { key: 'p_name', type: 'text', label: '产品名称', placeholder: '', required: true, defaultValue: '' }
    ],
    outputFormat: 'text',
    duration: 12,
    balanceCost: 198,
    popular: true
  },
  {
    id: '7572138799503048744',
    name: '抖音百万播放爆款小故事',
    description: '抖音200w播放爆款小故事，推荐矩阵号使用',
    icon: '🎬',
    category: '自媒体运营',
    coverVideo: 'https://1354453097.vod-qcloud.com/356b5b33vodtranscq1354453097/465c66e55145403704873865442/v.f100010.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '任意主题，例如：苍蝇吃屎', placeholder: '', required: true, defaultValue: '' },
      { key: 'bili', type: 'option', label: '比例', placeholder: '选择：9:16 或 16:9', required: true, defaultValue: '9:16', options: [{ value: '9:16', label: '9:16' }, { value: '16:9', label: '16:9' }] }
    ],
    outputFormat: 'text',
    duration: 12,
    balanceCost: 198,
    popular: true
  },
  {
    id: '7576101830552682546',
    name: '一键生成3d文旅直播贴片',
    description: '一键生成3d文旅直播贴片',
    icon: '🤔',
    category: '电商内容',
    coverVideo: 'https://1354453097.vod-qcloud.com/945ed1favodtranssh1354453097/dfffc6f75145403706114744316/v.f100020.mp4',
    inputs: [
      { key: 'city_name', type: 'text', label: '城市名称', placeholder: '比如：杭州', required: true, defaultValue: '' },
      { key: 'bili', type: 'option', label: '比例', placeholder: '选择', required: true, defaultValue: '9:16', options: [{ value: '9:16', label: '9:16' }, { value: '16:9', label: '16:9' }, { value: '4:3', label: '4:3' }, { value: '3:4', label: '3:4' }, { value: '1:1', label: '1:1' }] },
      { key: 'culture', type: 'text', label: '地标性建筑或相关文化', placeholder: '比如：西湖', required: false, defaultValue: '' }
    ],
    outputFormat: 'text',
    duration: 7,
    balanceCost: 50
  },
  {
    id: '7576199066141343771',
    name: '一键生成3d电商贴片',
    description: '一键生成3d电商贴片',
    icon: '🤔',
    category: '电商内容',
    coverVideo: 'https://1354453097.vod-qcloud.com/945ed1favodtranssh1354453097/7dbf46bb5145403706130464782/v.f100020.mp4',
    inputs: [
      { key: 'cppl', type: 'text', label: '产品品类', placeholder: '产品品类', required: true, defaultValue: '' },
      { key: 'bili', type: 'option', label: '比例', placeholder: '选择', required: true, defaultValue: '9:16', options: [{ value: '9:16', label: '9:16' }, { value: '16:9', label: '16:9' }, { value: '4:3', label: '4:3' }, { value: '3:4', label: '3:4' }, { value: '1:1', label: '1:1' }] },
      { key: 'price1', type: 'text', label: '福利内容1', placeholder: '福利内容1', required: false, defaultValue: '' },
      { key: 'price2', type: 'text', label: '福利内容2', placeholder: '福利内容2', required: false, defaultValue: '' },
      { key: 'price3', type: 'text', label: '福利内容3', placeholder: '福利内容3', required: false, defaultValue: '' },
      { key: 'price4', type: 'text', label: '福利内容4', placeholder: '福利内容4', required: false, defaultValue: '' },
      { key: 'price5', type: 'text', label: '福利内容5', placeholder: '福利内容5', required: false, defaultValue: '' },
      { key: 'price6', type: 'text', label: '福利内容6', placeholder: '福利内容6', required: false, defaultValue: '' }
    ],
    outputFormat: 'text',
    duration: 7,
    balanceCost: 50
  },
  {
    id: '7571725726002233344',
    name: '产品设计调研',
    description: '针对特定产品类别进行全面的设计调研分析',
    icon: '🔍',
    category: '文案策划',
    coverImage: '',
    coverVideo: '',
    inputs: [
      { key: 'input', type: 'text', label: '产品类别', placeholder: '请输入要调研的产品类别，如：智能手机、电动汽车、家用电器等', required: true, defaultValue: '智能手机' }
    ],
    outputFormat: 'text',
    duration: 14,
    balanceCost: 49
  },
  {
    id: '7571727635970015272',
    name: '一键制作情感主题混剪视频',
    description: '一键制作情感主题混剪视频',
    icon: '🎬',
    category: '自媒体运营',
    coverVideo: 'https://1354453097.vod-qcloud.com/5e816d8bvodcq1354453097/7f9aff185145403699461798765/oSCRKMbE0NUA.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '有关情感的一句话', placeholder: '爱情让人成长', required: true, defaultValue: '' }
    ],
    outputFormat: 'text',
    duration: 9,
    balanceCost: 49
  },
  {
    id: '7571725668209311784',
    name: '漫画风格职场话题',
    description: '漫画风格职场话题',
    icon: '💼',
    category: '自媒体运营',
    coverVideo: 'https://1354453097.vod-qcloud.com/5e816d8bvodcq1354453097/5ae1f33c5145403699471001354/MSEPXTQq2hkA.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '主题', placeholder: '职场相关的一句话', required: true, defaultValue: '' }
    ],
    outputFormat: 'text',
    duration: 13,
    balanceCost: 78
  },
  {
    id: '7571725697405337652',
    name: 'TK赛道英文故事视频',
    description: 'TK赛道英文故事视频',
    icon: '🐕',
    category: '自媒体运营',
    coverVideo: 'https://1354453097.vod-qcloud.com/5e816d8bvodcq1354453097/abddabe75145403699465401196/oms8eBtQYZYA.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '主人和金毛有关的任何词或句子', placeholder: '', required: true, defaultValue: '' }
    ],
    outputFormat: 'text',
    duration: 11,
    balanceCost: 79
  },
  {
    id: '7571725514898800680',
    name: '生成哲学认知视频',
    description: '生成哲学认知视频',
    icon: '🤔',
    category: '自媒体运营',
    coverVideo: 'https://1354453097.vod-qcloud.com/bd74e452vodsh1354453097/d6f0161d5145403699469070000/U2eb5WE2H7cA.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '任意哲学类主题', placeholder: '比如：唯物主义', required: true, defaultValue: '' }
    ],
    outputFormat: 'text',
    duration: 9,
    balanceCost: 78
  },
  {
    id: '7571726561381793818',
    name: '60s电商宣传视频',
    description: '电商宣传视频（参照产品单独生成一个电商演示视频）',
    icon: '🛒',
    category: '电商内容',
    coverVideo: 'https://1354453097.vod-qcloud.com/945ed1favodtranssh1354453097/abf5f7495145403705436756946/v.f100020.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '任意产品名称，可带品牌', placeholder: '产品', required: true, defaultValue: '' },
      { key: 'production', type: 'image', label: '产品图片', required: true },
      { key: 'logo', type: 'image', label: '产品logo', required: true },
      { key: 'text', type: 'text', label: '产品文案', placeholder: '可选', required: false, defaultValue: '' },
      { key: 'size', type: 'text', label: '产品尺寸', placeholder: '例如：2cm*2cm*2cm', required: false },
      { key: 'text_gg', type: 'text', label: '产品广告词', placeholder: '可选', required: false }
    ],
    outputFormat: 'text',
    duration: 32,
    balanceCost: 899,
    popular: true
  },
  {
    id: '7571727683307061282',
    name: '15s电商宣传视频（sr无文字版）',
    description: '参照产品图片生成一个15s的电商演示视频，视频中不带有文字，推荐无文字商品使用',
    icon: '🛒',
    category: '电商内容',
    coverVideo: 'https://1354453097.vod-qcloud.com/945ed1favodtranssh1354453097/855fd4cf5145403704993269955/v.f100030.mp4',
    coverImage: '',
    outputFormat: 'text',
    duration: 20,
    balanceCost: 199,
    status: 'active',
    inputs: [
      { key: 'input', type: 'text', label: '任意产品名称，可带品牌', placeholder: '产品名称', required: true, defaultValue: '' },
      { key: 'img', type: 'image', label: '产品主要图片', placeholder: '', required: true, defaultValue: '' },
      { key: 'bili', type: 'option', label: '比例', placeholder: '选择：9:16 或 16:9', required: true, defaultValue: '9:16', options: [{ value: '9:16', label: '9:16' }, { value: '16:9', label: '16:9' }] },
      { key: 'fengge', type: 'text', label: '风格', placeholder: '', required: true, defaultValue: '' },
      { key: 'img1', type: 'image', label: '产品辅助细节图片1', placeholder: '', required: false, defaultValue: '' },
      { key: 'img2', type: 'image', label: '产品辅助细节图片2', placeholder: '', required: false, defaultValue: '' },
      { key: 'wenan', type: 'text', label: '需要的广告词或相关文案', placeholder: '', required: false, defaultValue: '' },
      { key: 'language', type: 'text', label: '需要的配音语种', placeholder: '', required: false, defaultValue: '' },
      { key: 'if', type: 'text', label: '是否需要模特', placeholder: '是或否', required: false, defaultValue: '' },
      { key: 'character', type: 'text', label: '模特类型', placeholder: '美女，帅哥，小孩', required: false, defaultValue: '' }
    ]
  },
  {
    id: '7573632540247212047',
    name: '15s电商宣传视频（sr版有文字版）',
    description: '电商宣传视频（参照产品图片生成15s电商演示视频，清晰度1080p）',
    icon: '🛒',
    category: '电商内容',
    coverVideo: 'https://1354453097.vod-qcloud.com/945ed1favodtranssh1354453097/47490ca85145403705628951819/v.f100040.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '任意产品名称，可带品牌', placeholder: '产品名称', required: true, defaultValue: '' },
      { key: 'img', type: 'image', label: '产品主要图片', required: true },
      { key: 'bili', type: 'option', label: '比例', placeholder: '选择：9:16 或 16:9', required: true, defaultValue: '9:16', options: [{ value: '9:16', label: '9:16' }, { value: '16:9', label: '16:9' }] },
      { key: 'fengge', type: 'text', label: '风格', placeholder: '', required: true, defaultValue: '' },
      { key: 'img1', type: 'image', label: '产品辅助细节图片1', required: false },
      { key: 'img2', type: 'image', label: '产品辅助细节图片2', required: false }
    ],
    outputFormat: 'text',
    duration: 30,
    balanceCost: 299
  },
  {
    id: '7578834425648791606',
    name: '15s电商宣传视频（帽子品类专用）',
    description: '电商宣传视频（参照帽子类产品图片生成15s电商演示视频，清晰度1080p）',
    icon: '🛒',
    category: '电商内容',
    coverVideo: 'https://1354453097.vod-qcloud.com/945ed1favodtranssh1354453097/7cb142865145403707378179433/v.f100030.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '任意产品名称，可带品牌', placeholder: '产品名称', required: true, defaultValue: '' },
      { key: 'img', type: 'image', label: '产品主要图片', required: true },
      { key: 'bili', type: 'option', label: '比例', placeholder: '选择：9:16 或 16:9', required: true, defaultValue: '9:16', options: [{ value: '9:16', label: '9:16' }, { value: '16:9', label: '16:9' }] },
      { key: 'fengge', type: 'text', label: '风格', placeholder: '', required: true, defaultValue: '' },
      { key: 'img1', type: 'image', label: '产品辅助细节图片1', required: false },
      { key: 'img2', type: 'image', label: '产品辅助细节图片2', required: false }
    ],
    outputFormat: 'text',
    duration: 30,
    balanceCost: 199
  },
  {
    id: '7571727512984698895',
    name: '生成服装类展示视频',
    description: '一键生成服装类展示视频',
    icon: '🛒',
    category: '电商内容',
    coverVideo: 'https://1354453097.vod-qcloud.com/945ed1favodtranssh1354453097/668b82a95145403704989203677/v.f100030.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '任意服装类型名称，可带品牌', placeholder: '服装名称', required: true, defaultValue: '' },
      { key: 'img', type: 'image', label: '服装图片', required: true },
      { key: 'bili', type: 'option', label: '比例', placeholder: '选择：9:16 或 16:9', required: true, defaultValue: '9:16', options: [{ value: '9:16', label: '9:16' }, { value: '16:9', label: '16:9' }] },
      { key: 'fengge', type: 'text', label: '风格', placeholder: '', required: true, defaultValue: '' }
    ],
    outputFormat: 'text',
    duration: 20,
    balanceCost: 199
  },
  {
    id: '7571727750898384905',
    name: '产品海报生成',
    description: '一键生成海报',
    icon: '🛒',
    category: '品宣制作',
    coverImage: '',
    coverVideo: 'https://1354453097.vod-qcloud.com/945ed1favodtranssh1354453097/bb3137c35145403700797026549/v.f100030.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '设计风格', placeholder: '设计元素、风格等。不填则风格随机。', required: false, defaultValue: '' },
      { key: 'image', type: 'image', label: '产品图片', required: true },
      { key: 'input2', type: 'text', label: '产品名称', placeholder: '产品名称', required: true, defaultValue: '' },
      { key: 'wenan', type: 'text', label: '广告文案', placeholder: '文案', required: false, defaultValue: '' },
      { key: 'yuyan', type: 'option', label: '语种', placeholder: '默认为空，若无需翻译留空即可', required: false, defaultValue: '', options: [{ value: '', label: '默认为空，若无需翻译留空即可' }, { value: '中文', label: '中文' }, { value: '英语', label: '英语' }, { value: '日语', label: '日语' }, { value: '韩语', label: '韩语' }, { value: '法语', label: '法语' }] },
      { key: 'qr_img', type: 'image', label: '产品二维码', required: false },
      { key: 'qr_place', type: 'option', label: '二维码位置', placeholder: '', required: false, defaultValue: 'se', options: [{ value: 'se', label: '（默认值）右下角' }, { value: 'ne', label: '右上角' }, { value: 'sw', label: '左下角' }, { value: 'nw', label: '左上角' }, { value: 'center', label: '中部' }, { value: 'north', label: '上边' }, { value: 'west', label: '左边' }, { value: 'east', label: '右边' }, { value: 'south', label: '下边' }] },
      { key: 'bili', type: 'option', label: '比例', placeholder: '例如9:16', required: true, defaultValue: '9:16', options: [{ value: '9:16', label: '9:16' }, { value: '16:9', label: '16:9' }, { value: '4:3', label: '4:3' }, { value: '3:4', label: '3:4' }, { value: '1:1', label: '1:1' }] }
    ],
    outputFormat: 'text',
    duration: 10,
    balanceCost: 99,
    popular: true
  },
  {
    id: '7571727560112980008',
    name: '产品海报生成(手拍产品版)',
    description: '一键生成海报',
    icon: '🛒',
    category: '品宣制作',
    coverImage: '',
    coverVideo: 'https://1354453097.vod-qcloud.com/945ed1favodtranssh1354453097/c51674d15145403705433761002/v.f100020.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '设计风格', placeholder: '设计元素、风格等。不填则风格随机。', required: false, defaultValue: '' },
      { key: 'image', type: 'image', label: '产品图片（上传手机拍摄的图片）', required: true },
      { key: 'input2', type: 'text', label: '产品名称', placeholder: '产品名称', required: true, defaultValue: '' },
      { key: 'wenan', type: 'text', label: '广告文案', placeholder: '文案', required: false, defaultValue: '' },
      { key: 'yuyan', type: 'text', label: '语种', placeholder: '语种', required: false, defaultValue: '' },
      { key: 'qr_img', type: 'image', label: '产品二维码', required: false },
      { key: 'qr_place', type: 'option', label: '二维码位置', placeholder: '', required: false, defaultValue: '', options: [{ value: 'se', label: '（默认值）右下角' }, { value: 'ne', label: '右上角' }, { value: 'sw', label: '左下角' }, { value: 'nw', label: '左上角' }, { value: 'center', label: '中部' }, { value: 'north', label: '上边' }, { value: 'west', label: '左边' }, { value: 'east', label: '右边' }, { value: 'south', label: '下边' }] },
      { key: 'bili', type: 'option', label: '比例', placeholder: '例如9:16', required: true, defaultValue: '', options: [{ value: '9:16', label: '9:16' }, { value: '16:9', label: '16:9' }, { value: '4:3', label: '4:3' }, { value: '3:4', label: '3:4' }, { value: '1:1', label: '1:1' }] }
    ],
    outputFormat: 'text',
    duration: 10,
    balanceCost: 99
  },
  {
    id: '7577697988374708275',
    name: '玩偶海报生成',
    description: '一键生成玩偶类海报',
    icon: '🛒',
    category: '品宣制作',
    coverImage: '',
    coverVideo: 'https://1354453097.vod-qcloud.com/945ed1favodtranssh1354453097/b330ebe25145403707372330995/v.f100030.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '设计风格', placeholder: '设计元素、风格等。不填则风格随机。', required: false, defaultValue: '' },
      { key: 'image', type: 'image', label: '产品图片', required: true },
      { key: 'input2', type: 'text', label: '产品名称', placeholder: '产品名称', required: true, defaultValue: '' },
      { key: 'wenan', type: 'text', label: '广告文案', placeholder: '文案', required: false, defaultValue: '' },
      { key: 'yuyan', type: 'text', label: '语种', placeholder: '语种', required: false, defaultValue: '' },
      { key: 'qr_img', type: 'image', label: '产品二维码', required: false },
      { key: 'qr_place', type: 'option', label: '二维码位置', placeholder: '', required: false, defaultValue: '', options: [{ value: 'se', label: '（默认值）右下角' }, { value: 'ne', label: '右上角' }, { value: 'sw', label: '左下角' }, { value: 'nw', label: '左上角' }, { value: 'center', label: '中部' }, { value: 'north', label: '上边' }, { value: 'west', label: '左边' }, { value: 'east', label: '右边' }, { value: 'south', label: '下边' }] },
      { key: 'bili', type: 'option', label: '比例', placeholder: '例如9:16', required: true, defaultValue: '', options: [{ value: '9:16', label: '9:16' }, { value: '16:9', label: '16:9' }, { value: '4:3', label: '4:3' }, { value: '3:4', label: '3:4' }, { value: '1:1', label: '1:1' }] }
    ],
    outputFormat: 'text',
    duration: 10,
    balanceCost: 50
  },
  {
    id: '7571726856828928035',
    name: '品牌海报生成',
    description: '一键生成品牌海报',
    icon: '🛒',
    category: '品宣制作',
    coverImage: '',
    coverVideo: 'https://1354453097.vod-qcloud.com/945ed1favodtranssh1354453097/4b66855f5145403704975455042/v.f100030.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '设计风格', placeholder: '设计元素、风格等。', required: true, defaultValue: '' },
      { key: 'logo', type: 'image', label: 'logo', required: true },
      { key: 'ID', type: 'text', label: '公司名称', placeholder: '', required: true, defaultValue: '' },
      { key: 'slogan', type: 'text', label: '广告slogan', placeholder: 'slogan', required: true, defaultValue: '' },
      { key: 'Theme', type: 'text', label: '品牌主题', placeholder: '', required: true, defaultValue: '' },
      { key: 'hangye', type: 'text', label: '行业', required: true },
      { key: 'jiazhidian', type: 'text', label: '价值点', placeholder: '', required: true, defaultValue: '' }
    ],
    outputFormat: 'text',
    duration: 11,
    balanceCost: 118
  },
  {
    id: '7571759154474450971',
    name: '产品海报生成（无文字版本）',
    description: '一键生成海报（无文字）',
    icon: '🛒',
    category: '品宣制作',
    coverImage: '',
    coverVideo: 'https://1354453097.vod-qcloud.com/945ed1favodtranssh1354453097/7167eba75145403705592552857/v.f100030.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '设计风格', placeholder: '设计元素、风格等。不填则风格随机。', required: false, defaultValue: '' },
      { key: 'image', type: 'image', label: '产品图片', required: true },
      { key: 'bili', type: 'option', label: '比例', placeholder: '例如9:16', required: true, defaultValue: '', options: [{ value: '9:16', label: '9:16' }, { value: '16:9', label: '16:9' }, { value: '4:3', label: '4:3' }, { value: '3:4', label: '3:4' }, { value: '1:1', label: '1:1' }] },
      { key: 'input2', type: 'text', label: '产品名称', placeholder: '产品名称', required: true, defaultValue: '' }
    ],
    outputFormat: 'text',
    duration: 12,
    balanceCost: 98
  },
  {
    id: '7571727605704818703',
    name: '动态海报',
    description: '动态产品海报',
    icon: '🤔',
    category: '品宣制作',
    coverVideo: 'https://1354453097.vod-qcloud.com/945ed1favodtranssh1354453097/d39fb7d85145403703328339115/v.f100030.mp4',
    inputs: [
      { key: 'input', type: 'image', label: '海报', required: true },
      { key: 'sentence', type: 'text', label: '广告词', placeholder: '', required: false, defaultValue: '' }
    ],
    outputFormat: 'text',
    duration: 11,
    balanceCost: 68
  },
  {
    id: '7571726234607419432',
    name: '任意主题漫画视频生成',
    description: '根据主题词，一键生成漫画版视频。',
    icon: '🤔',
    category: '自媒体运营',
    coverVideo: 'https://1354453097.vod-qcloud.com/bd74e452vodsh1354453097/5ae397da5145403699471004313/AehVHref6j8A.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '任意主题漫画', placeholder: '如何快速赚到人生第一桶金', required: true, defaultValue: '如何快速赚到人生第一桶金' }
    ],
    outputFormat: 'text',
    duration: 9,
    balanceCost: 79
  },
  {
    id: '7571727465019408418',
    name: '一键生成历史故事',
    description: '一键生成历史故事',
    icon: '✍️',
    category: '自媒体运营',
    coverVideo: 'https://1354453097.vod-qcloud.com/356b5b33vodtranscq1354453097/207231c75145403699904603905/v.f100030.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '任意故事主题', placeholder: '例如：玄武门事变', required: true, defaultValue: '' },
      { key: 'auto_text', type: 'text', label: '故事文本', placeholder: '若已经有故事文本可填入此处，不填则AI自动生成', required: false, defaultValue: '' }
    ],
    outputFormat: 'text',
    duration: 13,
    balanceCost: 139
  },
  {
    id: '7571727035996241929',
    name: '小人国故事（古代）',
    description: '输入小人行为，一键生成古代小人国视频',
    icon: '🤔',
    category: '自媒体运营',
    coverVideo: 'https://1354453097.vod-qcloud.com/356b5b33vodtranscq1354453097/508f5af15145403699915232897/v.f100030.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '任意行为事件', placeholder: '科举', required: true, defaultValue: '科举' }
    ],
    outputFormat: 'text',
    duration: 11,
    balanceCost: 118
  },
  {
    id: '7571727156469776399',
    name: '小人国故事（现代）',
    description: '输入小人行为，一键生成现代小人国视频',
    icon: '🤔',
    category: '自媒体运营',
    coverVideo: 'https://1354453097.vod-qcloud.com/945ed1favodtranssh1354453097/abdea9415145403700790505867/v.f100030.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '任意行为事件', placeholder: '考试', required: true, defaultValue: '考试' }
    ],
    outputFormat: 'text',
    duration: 13,
    balanceCost: 118
  },
  {
    id: '7571726278820085794',
    name: '黑白英语心理学',
    description: '黑白英语心理学双9：16',
    icon: '🤔',
    category: '自媒体运营',
    coverVideo: 'https://1354453097.vod-qcloud.com/356b5b33vodtranscq1354453097/236c64fd5145403699904797868/v.f100030.mp4',
    inputs: [
      { key: 'author', type: 'text', label: '作者', placeholder: '弗洛伊德', required: true, defaultValue: '弗洛伊德' },
      { key: 'title', type: 'text', label: '主题', placeholder: '梦到了鳄鱼', required: true, defaultValue: '梦到了鳄鱼' },
      { key: 'xilie', type: 'text', label: '系列', placeholder: '梦的解析', required: false, defaultValue: '' },
      { key: 'input', type: 'text', label: '自定义文本', placeholder: '若已经有自定义文本可填入此处，不填则AI自动生成', required: false, defaultValue: '' }
    ],
    outputFormat: 'text',
    duration: 10,
    balanceCost: 299
  },
  {
    id: '7571725578618241050',
    name: '钦天监黄历视频工作流',
    description: '钦天监黄历视频工作流',
    icon: '🤔',
    category: '自媒体运营',
    coverVideo: 'https://1354453097.vod-qcloud.com/356b5b33vodtranscq1354453097/20745f915145403699904607848/v.f100030.mp4',
    inputs: [
      { key: 'date', type: 'text', label: '日期', placeholder: '2024-8-29', required: true, defaultValue: '2024-8-29' },
      { key: 'bottom_right_text', type: 'text', label: '水印', placeholder: '水印', required: false, defaultValue: '' },
      { key: 'home_bg_gif', type: 'image', label: '背景图片', required: false },
      { key: 'auto_text', type: 'text', label: '文本', placeholder: '若已经有文本可填入此处，不填则AI自动生成', required: false, defaultValue: '' }
    ],
    outputFormat: 'text',
    duration: 8,
    balanceCost: 88
  },
  {
    id: '7571726490828914722',
    name: '胖胖橘猫',
    description: '胖胖橘猫的日常生活',
    icon: '🤔',
    category: '自媒体运营',
    coverVideo: 'https://1354453097.vod-qcloud.com/356b5b33vodtranscq1354453097/f135bd885145403699900807823/v.f100030.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '胖胖橘猫的日常', placeholder: '刷牙洗脸上床睡觉', required: true, defaultValue: '' }
    ],
    outputFormat: 'text',
    duration: 11,
    balanceCost: 89
  },
  {
    id: '7571726194716442662',
    name: '一键生成书籍裸眼3d名场面视频',
    description: '一键生成书籍裸眼3d名场面视频',
    icon: '🤔',
    category: '自媒体运营',
    coverVideo: 'https://1354453097.vod-qcloud.com/945ed1favodtranssh1354453097/fe9bf1125145403699907281929/v.f100030.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '名场面', placeholder: '任意名场面', required: true, defaultValue: '' }
    ],
    outputFormat: 'text',
    duration: 9,
    balanceCost: 59
  },
  {
    id: '7571725610427514895',
    name: '古诗词视频',
    description: '根据主题生成古诗词相关视频',
    icon: '🤔',
    category: '自媒体运营',
    coverVideo: 'https://1354453097.vod-qcloud.com/356b5b33vodtranscq1354453097/059bd5ed5145403699907582173/v.f100030.mp4',
    inputs: [
      { key: 'title', type: 'text', label: '任意主题', placeholder: '咏月诗，咏春诗，自由等', required: true, defaultValue: '' }
    ],
    outputFormat: 'text',
    duration: 8,
    balanceCost: 79
  },
  {
    id: '7571725821133193250',
    name: '灵魂画手视频',
    description: '灵魂画手视频（尽量在30s内不要超过1min）',
    icon: '🤔',
    category: '自媒体运营',
    coverVideo: 'https://1354453097.vod-qcloud.com/356b5b33vodtranscq1354453097/d25b396b5145403699910381693/v.f100030.mp4',
    inputs: [
      { key: 'video', type: 'video', label: '视频', required: true },
      { key: 'type', type: 'text', label: '间隔几秒绘制一次', placeholder: '5', required: true, defaultValue: '' }
    ],
    outputFormat: 'text',
    duration: 8,
    balanceCost: 79
  },
  {
    id: '7571725779442188323',
    name: '语文课文解读视频',
    description: '语文课本解读，输入课文标题，生成课文解读视频',
    icon: '🤔',
    category: '自媒体运营',
    coverVideo: 'https://1354453097.vod-qcloud.com/356b5b33vodtranscq1354453097/aec0041f5145403699906109003/v.f100030.mp4',
    inputs: [
      { key: 'title', type: 'text', label: '课本上的文章标题', required: true, placeholder: '例如：最后一片常春藤叶', defaultValue: '' },
      { key: 'bgm', type: 'audio', label: '背景音乐', required: true },
      { key: 'logo', type: 'image', label: '视频logo', required: false },
      { key: 'ID', type: 'text', label: 'id', placeholder: '', required: false, defaultValue: '' }
    ],
    outputFormat: 'text',
    duration: 10,
    balanceCost: 299
  },
  {
    id: '7571726334205214756',
    name: '心理学动态火柴人视频',
    description: '心理学动态火柴人视频',
    icon: '🤔',
    category: '自媒体运营',
    coverVideo: 'https://1354453097.vod-qcloud.com/356b5b33vodtranscq1354453097/6e163c475145403699912405393/v.f100030.mp4',
    inputs: [
      { key: 'title', type: 'text', label: '主题', required: true, placeholder: '心理学主题', defaultValue: '工作记忆模型' },
      { key: 'left_top', type: 'text', label: '左上文字', placeholder: '', required: true, defaultValue: '111' },
      { key: 'right_top', type: 'text', label: '右上文字', placeholder: '', required: true, defaultValue: '222' }
    ],
    outputFormat: 'text',
    duration: 15,
    balanceCost: 149
  },
  {
    id: '7571754214227312681',
    name: '古代人物穿越自拍',
    description: '古代人物穿越自拍视频（豆包剧情版本）安东特别版',
    icon: '🤔',
    category: '自媒体运营',
    coverVideo: 'https://1354453097.vod-qcloud.com/356b5b33vodtranscq1354453097/5260e16f5145403699908554139/v.f100030.mp4',
    inputs: [
      { key: 'input', type: 'text', label: '主题', required: true, placeholder: '人物在哪里干什么', defaultValue: '' },
      { key: 'auto_text', type: 'text', label: '自定义文本', placeholder: '若已经有文本可填入此处，不填则AI自动生成', required: false, defaultValue: '' },
      { key: 'role', type: 'option', label: '角色性别', placeholder: '', required: true, defaultValue: '', options: [{ value: '男性', label: '男' }, { value: '女性', label: '女' }, { value: '其他', label: '其他' }] }
    ],
    outputFormat: 'text',
    duration: 11,
    balanceCost: 88
  },
  {
    id: '7571725754791460891',
    name: '飞影数字人对口型',
    description: '飞影数字人对口型',
    icon: '🤔',
    category: '自媒体运营',
    coverVideo: 'https://1354453097.vod-qcloud.com/945ed1favodtranssh1354453097/cff7d6675145403699910278810/v.f100030.mp4',
    inputs: [
      { key: 'audio_url', type: 'audio', label: '音频链接', required: true, placeholder: '' },
      { key: 'img_url', type: 'image', label: '图片链接', placeholder: '', required: true, defaultValue: '' },
      { key: 'video', type: 'video', label: '视频', required: false },
      { key: 'prompt', type: 'text', label: '提示词', placeholder: '提示词', required: false, defaultValue: '' }
    ],
    outputFormat: 'text',
    duration: 2,
    balanceCost: 19
  },
  {
    id: '7571726448031170623',
    name: '转链接',
    description: '文件转URL链接',
    icon: '📋',
    category: '功能',
    coverVideo: '',
    inputs: [
      { key: 'input', type: 'other', label: '文件', required: true }
    ],
    outputFormat: 'text',
    duration: 1,
    balanceCost: 0
  },
  {
    id: '7588061136764387347',
    name: '豆包1.5pro视频生成（首帧）',
    description: '豆包视频使用',
    icon: '',
    category: '电商内容',
    coverVideo: '',
    coverImage: '',
    outputFormat: 'text',
    duration: 5,
    balanceCost: 0,
    status: 'active',
    inputs: [
      { key: 'image', type: 'image', label: '图片', placeholder: '', required: true, defaultValue: '' },
      { key: 'image2', type: 'image', label: '图片', placeholder: '', required: false, defaultValue: '' },
      { key: 'prompt', type: 'text', label: '提示词', placeholder: '', required: true, defaultValue: '' },
      { key: 'bili', type: 'text', label: '比例', placeholder: '', required: true, defaultValue: '' },
      { key: 'duration', type: 'number', label: '视频时长', placeholder: '4-12 或 -1 自动', required: true, defaultValue: '' }
    ]
  },
  {
    id: '7597326488597970995',
    name: '解说类AI漫剧生成1.0',
    description: '输入比例，文案和风格参考图片一键生成剪映草稿,大约30分钟一集',
    icon: '',
    category: '功能',
    coverVideo: '',
    coverImage: '',
    outputFormat: 'text',
    duration: 30,
    balanceCost: 100,
    status: 'active',
    inputs: [
      { key: 'bili', type: 'text', label: '视频比例', placeholder: '', required: true, defaultValue: '' },
      { key: 'input', type: 'text', label: '剧本，文案', placeholder: '', required: true, defaultValue: '' },
      { key: 'ck_picture', type: 'image', label: '风格参考图片', placeholder: '', required: true, defaultValue: '' }
    ]
  },
  {
    id: '7599488266740776987',
    name: '角色数据创建',
    description: '将整个剧本导入到这个工作流即可，运行完成之后再执行下一个工作流',
    icon: '🛒',
    category: '功能',
    coverVideo: '',
    coverImage: '',
    outputFormat: 'text',
    duration: 8,
    balanceCost: 0,
    status: 'active',
    inputs: [
      { key: 'bili', type: 'text', label: '视频比例', placeholder: '9:16', required: true, defaultValue: '9:16' },
      { key: 'ck_picture', type: 'image', label: '视频风格参考图片', placeholder: '', required: true, defaultValue: '' },
      { key: 'ju', type: 'text', label: '剧名', placeholder: '', required: true, defaultValue: '' },
      { key: 'input', type: 'text', label: '剧本内容（整个剧本）', placeholder: '', required: true, defaultValue: '' }
    ]
  },
  {
    id: '7599497104369614894',
    name: '视频生成',
    description: '角色数据创建完成之后，角色创建一个剧本只需要创建一次，调用这个工作流生成剪映草稿',
    icon: '',
    category: '功能',
    coverVideo: '',
    coverImage: '',
    outputFormat: 'text',
    duration: 60,
    balanceCost: 0,
    status: 'active',
    inputs: [
      { key: 'script', type: 'text', label: '需要生成的剧本内容', placeholder: '', required: true, defaultValue: '' },
      { key: 'ck_picture', type: 'image', label: '风格参考图片，最好是人物', placeholder: '', required: true, defaultValue: '' },
      { key: 'bili', type: 'text', label: '比例', placeholder: '9:16', required: true, defaultValue: '' },
      { key: 'ju', type: 'text', label: '剧名，与创建角色数据的剧名保持一致', placeholder: '', required: true, defaultValue: '' }
    ]
  }
];

/**
 * 获取所有工作流
 */
export function getAllWorkflows(): CozeWorkflow[] {
  return workflows;
}

/**
 * 根据ID获取工作流
 */
export function getWorkflowById(id: string): CozeWorkflow | undefined {
  return workflows.find(workflow => workflow.id === id);
}

/**
 * 根据分类获取工作流
 */
export function getWorkflowsByCategory(category: string): CozeWorkflow[] {
  if (category === 'all') return workflows;
  return workflows.filter(workflow => workflow.category === category);
}

/**
 * 获取所有分类
 */
export function getAllCategories(): CozeWorkflowCategory[] {
  return categories;
}

/**
 * 获取热门工作流
 */
export function getPopularWorkflows(): CozeWorkflow[] {
  return workflows.filter(workflow => workflow.popular);
}

export default workflows;
