import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LogsPage } from '@/pages/LogsPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { PrizeConfigPage } from '@/pages/PrizeConfigPage'
import { RosterPage } from '@/pages/RosterPage'
import { RoundPage } from '@/pages/RoundPage'
import { IdleProvider } from '@/store/idle'
import { LotteryProvider } from '@/store/lottery'
import { PrefsProvider, rememberedRound } from '@/store/prefs'

/** 刷新或重新打开时回到上次所在的抽奖环节，没有记录再退回总览 */
function HomeRedirect() {
  const target = rememberedRound()
  return <Navigate to={target ? `/round/${target}` : '/overview'} replace />
}

/**
 * 用 HashRouter 而不是 BrowserRouter：
 * GitHub Pages 是纯静态托管，没有 SPA 回退，刷新 /round/onsite 这类深层路径会直接 404。
 * 哈希路由把路径放在 # 后面，任何静态托管下刷新都不会丢。
 * 抽奖现场会频繁刷新恢复状态，这一点比 URL 好看更重要。
 */
export default function App() {
  return (
    <PrefsProvider>
      <IdleProvider>
        <LotteryProvider>
          <HashRouter>
            <Routes>
              <Route path="/" element={<HomeRedirect />} />
              <Route path="/overview" element={<OverviewPage />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="/round/:roundId" element={<RoundPage />} />
              <Route path="/round/:roundId/roster" element={<RosterPage />} />
              <Route path="/round/:roundId/prizes" element={<PrizeConfigPage />} />
              <Route path="*" element={<HomeRedirect />} />
            </Routes>
          </HashRouter>
        </LotteryProvider>
      </IdleProvider>
    </PrefsProvider>
  )
}