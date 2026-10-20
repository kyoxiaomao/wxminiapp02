export default defineAppConfig({
  pages: [
    'pages/graph/index',
    'pages/card/index',
    'pages/card/detail/index',
    'pages/card/edit/index',
    'pages/onboarding/index',
    'pages/mine/index',
    'pages/feedback/index',
    'pages/about/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '名片图谱',
    navigationBarTextStyle: 'black'
  },
  tabBar: {
    color: '#999999',
    selectedColor: '#7d3c98',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/graph/index',
        text: '图谱',
        iconPath: 'assets/tabbar/graph.png',
        selectedIconPath: 'assets/tabbar/graph-selected.png'
      },
      {
        pagePath: 'pages/card/index',
        text: '名片',
        iconPath: 'assets/tabbar/card.png',
        selectedIconPath: 'assets/tabbar/card-selected.png'
      },
      {
        pagePath: 'pages/mine/index',
        text: '我的',
        iconPath: 'assets/tabbar/mine.png',
        selectedIconPath: 'assets/tabbar/mine-selected.png'
      }
    ]
  }
})
