export const RISK_LAB_ADDRESS = "0xfeed00000000000000000000000000000000feed";

const fixtures = new Map([
  [
    "1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    {
      mode: "fallback",
      token: {
        token_name: "USD Coin",
        token_symbol: "USDC",
        total_supply: "51781767254.62722",
        holder_count: "7350157",
        is_open_source: "1",
        is_proxy: "1",
        is_honeypot: "0",
        is_whitelisted: "0",
        transfer_pausable: "0",
        buy_tax: "0",
        sell_tax: "0",
        holders: [
          { address: "0x55fe002aeff02f77364de339a1292923a15844b8", percent: "0.089" },
          { address: "0x28c6c06298d514db089934071355e5743bf21d60", percent: "0.047" },
          { address: "0x0a59649758aa4d66e25f08dd01271e891fe52199", percent: "0.031" }
        ],
        lp_holders: [],
        lp_total_supply: "0"
      },
      pair: {
        chainId: "ethereum",
        dexId: "curve",
        pairAddress: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
        baseToken: {
          address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
          name: "USD Coin",
          symbol: "USDC"
        },
        priceUsd: "1.0000",
        liquidity: { usd: 126000000 },
        volume: { h24: 18000000 },
        priceChange: { h24: 0.01 },
        txns: { h24: { buys: 112, sells: 96 } },
        fdv: 51700000000
      }
    }
  ],
  [
    "1:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
    {
      mode: "fallback",
      token: {
        token_name: "Uniswap",
        token_symbol: "UNI",
        total_supply: "1000000000",
        holder_count: "384131",
        is_open_source: "1",
        is_proxy: "0",
        is_honeypot: "0",
        is_mintable: "0",
        hidden_owner: "0",
        owner_change_balance: "0",
        can_take_back_ownership: "0",
        selfdestruct: "0",
        is_blacklisted: "0",
        is_whitelisted: "0",
        transfer_pausable: "0",
        buy_tax: "0",
        sell_tax: "0",
        holders: [
          { address: "0x1a9c8182c09f50c8318d769245bea52c32be35bc", percent: "0.272134858479070410", is_contract: "1" },
          { address: "0x000000000000000000000000000000000000dead", percent: "0.105145579967052124", is_locked: "1" },
          { address: "0xf977814e90da44bfa03b6295a0616a897441acec", percent: "0.055441076412000000" },
          { address: "0x61cb39bece033c5bda281747db1c15cced2096eb", percent: "0.023047480513298522" },
          { address: "0x611f7bf868a6212f871e89f7e44684045ddfb09d", percent: "0.015963591920200000" }
        ],
        lp_holders: [],
        lp_total_supply: "0"
      },
      pair: {
        chainId: "ethereum",
        dexId: "uniswap",
        pairAddress: "0x1d42064Fc4Beb5F8aAF85F4617AE8b3b5B8Bd801",
        baseToken: {
          address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
          name: "Uniswap",
          symbol: "UNI"
        },
        priceUsd: "2.46",
        liquidity: { usd: 10372053.98 },
        volume: { h24: 550289.44 },
        priceChange: { h24: -7.28 },
        txns: { h24: { buys: 180, sells: 148 } },
        fdv: 2204691538
      }
    }
  ],
  [
    "1:0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
    {
      mode: "fallback",
      token: {
        token_name: "Aave Token",
        token_symbol: "AAVE",
        total_supply: "16000000",
        holder_count: "196266",
        is_open_source: "1",
        is_proxy: "1",
        is_honeypot: "0",
        buy_tax: "0",
        sell_tax: "0",
        holders: [
          { address: "0x4da27a545c0c5b758a6ba100e3a049001de870f5", percent: "0.132411501746996632", is_contract: "1" },
          { address: "0xf977814e90da44bfa03b6295a0616a897441acec", percent: "0.072313037687500000" },
          { address: "0x494aa25fa055d370424ed9db3839e76ee3e9e945", percent: "0.049397865195232975", is_contract: "1" },
          { address: "0xa700b4eb416be35b2911fd5dee80678ff64ff6c9", percent: "0.048856936074294195", is_contract: "1" },
          { address: "0x25f2226b597e8f9514b3f68f00f494cf4f286491", percent: "0.036996902286918978", is_contract: "1" }
        ],
        lp_holder_count: "170",
        lp_total_supply: "24198.63458214153",
        lp_holders: [
          { address: "0xa6dfbebf6f3ae1c7c46e60a1d353387edece70df", percent: "0.234626561841594887", is_contract: "1" },
          { address: "0xc28e494af76c4118ebc9eefb5bc757b52db261a5", percent: "0.108435237531373905" },
          { address: "0x9539b9e9253136f7a7ebdeb32fc51393ebc3a0a8", percent: "0.094426150287710764" }
        ]
      },
      pair: {
        chainId: "ethereum",
        dexId: "balancer",
        pairAddress: "0x3de27EFa2F1AA663Ae5D458857e731c129069F29",
        baseToken: {
          address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
          name: "Aave Token",
          symbol: "AAVE"
        },
        priceUsd: "63.17",
        liquidity: { usd: 9556196.33 },
        volume: { h24: 1150225.42 },
        priceChange: { h24: -12.08 },
        txns: { h24: { buys: 134, sells: 157 } },
        fdv: 1010755746
      }
    }
  ],
  [
    "1:0x6982508145454ce325ddbe47a25d4ec3d2311933",
    {
      mode: "fallback",
      token: {
        token_name: "Pepe",
        token_symbol: "PEPE",
        total_supply: "420689899646442.539491331875576506",
        holder_count: "558767",
        is_open_source: "1",
        is_proxy: "0",
        is_honeypot: "0",
        is_mintable: "0",
        hidden_owner: "0",
        owner_change_balance: "0",
        can_take_back_ownership: "0",
        selfdestruct: "0",
        is_blacklisted: "1",
        is_whitelisted: "0",
        transfer_pausable: "0",
        buy_tax: "0",
        sell_tax: "0",
        holders: [
          { address: "0xf977814e90da44bfa03b6295a0616a897441acec", percent: "0.133391366975022618" },
          { address: "0x1d48963dd8fada6ab5c2c7b92eba81ecc5030270", percent: "0.067566286931272915" },
          { address: "0x5a52e96bacdabb82fd05763e25335261b270efcb", percent: "0.040468990999472315" },
          { address: "0x3f9a8345729ea842708e080e238c92731e5699b8", percent: "0.036265422192433160" },
          { address: "0x611f7bf868a6212f871e89f7e44684045ddfb09d", percent: "0.032960781520552443" }
        ],
        lp_holder_count: "72",
        lp_total_supply: "28018576.594926108319966289",
        lp_holders: [
          { address: "0x6982508145454ce325ddbe47a25d4ec3d2311933", percent: "0.998906557866301962", is_contract: "1" },
          { address: "0x4c3923c5e4e87eb2f0eb7db6818ee743ddc9cd50", percent: "0.000184901134572947" },
          { address: "0x000000000000000000000000000000000000dead", percent: "0.000091363750655003", is_locked: "1" }
        ]
      },
      pair: {
        chainId: "ethereum",
        dexId: "uniswap",
        pairAddress: "0xA43fe16908251ee70EF74718545e4FE6C5cCEc9f",
        baseToken: {
          address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
          name: "Pepe",
          symbol: "PEPE"
        },
        priceUsd: "0.000002758",
        liquidity: { usd: 19150986.89 },
        volume: { h24: 1339687.98 },
        priceChange: { h24: -7.56 },
        txns: { h24: { buys: 310, sells: 259 } },
        fdv: 1141393505
      }
    }
  ],
  [
    `1:${RISK_LAB_ADDRESS}`,
    {
      mode: "fixture-only",
      token: {
        token_name: "ChainLens Risk Lab",
        token_symbol: "RISKLAB",
        total_supply: "1000000000",
        holder_count: "46",
        is_open_source: "0",
        is_proxy: "0",
        is_honeypot: "1",
        is_mintable: "1",
        hidden_owner: "1",
        owner_change_balance: "1",
        can_take_back_ownership: "1",
        selfdestruct: "0",
        is_blacklisted: "1",
        is_whitelisted: "1",
        transfer_pausable: "1",
        buy_tax: "0.12",
        sell_tax: "0.35",
        holders: [
          { address: "0x7bad000000000000000000000000000000000001", percent: "0.41" },
          { address: "0x7bad000000000000000000000000000000000002", percent: "0.24" },
          { address: "0x7bad000000000000000000000000000000000003", percent: "0.16" },
          { address: "0x7bad000000000000000000000000000000000004", percent: "0.07" }
        ],
        lp_holder_count: "2",
        lp_total_supply: "100000",
        lp_holders: [
          { address: "0x7bad000000000000000000000000000000000099", percent: "0.96", is_locked: "0" },
          { address: "0x000000000000000000000000000000000000dead", percent: "0.04", is_locked: "1" }
        ]
      },
      pair: {
        chainId: "ethereum",
        dexId: "uniswap",
        pairAddress: "0xface00000000000000000000000000000000face",
        baseToken: {
          address: RISK_LAB_ADDRESS,
          name: "ChainLens Risk Lab",
          symbol: "RISKLAB"
        },
        priceUsd: "0.00042",
        liquidity: { usd: 742 },
        volume: { h24: 187 },
        priceChange: { h24: -64.2 },
        txns: { h24: { buys: 8, sells: 1 } },
        fdv: 420000
      }
    }
  ]
]);

export function getTokenFixture({ chainId, address }) {
  return fixtures.get(`${chainId}:${address.toLowerCase()}`) || null;
}
