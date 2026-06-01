import { LocationProvider, Router, Route } from 'preact-iso'
import { Landing } from '@/pages/Landing'
import { Latched } from '@/pages/Latched'
import { About } from '@/pages/About'
import { Trust } from '@/pages/Trust'
import { Privacy } from '@/pages/Privacy'
import { Changelog } from '@/pages/Changelog'
import { Source } from '@/pages/Source'
import { NotFound } from '@/pages/NotFound'
import { Toaster } from '@/components/Toaster'

/**
 * client-side routing for the SPA. eager imports for now — the route
 * tree is small and the stubs are tiny; lazy boundaries become
 * worthwhile once subpage copy fills out in polish. `<Route default>`
 * is preact-iso's 404 sink.
 */
export function App() {
  return (
    <LocationProvider>
      <Router>
        <Route path="/" component={Landing} />
        <Route path="/latched" component={Latched} />
        <Route path="/about" component={About} />
        <Route path="/trust" component={Trust} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/changelog" component={Changelog} />
        <Route path="/source" component={Source} />
        <Route default component={NotFound} />
      </Router>
      <Toaster />
    </LocationProvider>
  )
}
