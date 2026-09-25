// 纸浆补配台账种子数据：登记总量与纤维类型为档案基准，
// 领用记录只增不减，余量一律由明细累加推导。
export const pulpReplenishmentSeed = [
  {
    batchCode: 'A-03',
    fiber: '桑皮纤维',
    registered: 6,
    unit: '批',
    withdrawals: [
      {
        id: 'A-03-20260921-01',
        amount: 1,
        operator: '韩澈',
        at: '2026-09-21 09:40',
        note: '标题栏虫道补纸',
      },
      {
        id: 'A-03-20260922-01',
        amount: 2,
        operator: '韩澈',
        at: '2026-09-22 16:10',
        note: '装订线外沿补纸',
      },
    ],
  },
  {
    batchCode: 'B-11',
    fiber: '楮皮纤维',
    registered: 4,
    unit: '批',
    withdrawals: [
      {
        id: 'B-11-20260923-01',
        amount: 1,
        operator: '陆宁',
        at: '2026-09-23 10:25',
        note: '边缘卷曲加固试样',
      },
    ],
  },
  {
    batchCode: 'C-02',
    fiber: '竹纤维',
    registered: 3,
    unit: '批',
    withdrawals: [],
  },
]
