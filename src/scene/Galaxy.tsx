import { OrbitControls, Stars, Text } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { CSSProperties, ElementRef, FormEvent, RefObject } from 'react'
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Group,
  LinearFilter,
  MeshBasicMaterial,
  RepeatWrapping,
  Vector3,
} from 'three'
import type {
  ActivityCategory,
  CategoryMix,
  ChainBlock,
  DataSource,
  ProgramActivityResult,
  ProgramCounts,
  ProgramRollup,
} from '../data/solana'
import {
  fetchProgramActivity,
  getCachedBlockBySlot,
  getCachedProgramRollup,
  getKnownProgramMetadata,
  useSolanaBlocks,
} from '../data/solana'
import { Block } from './Block'
import { createPlanetTextureSet } from './textures'
import type { PlanetVariant } from './textures'

type ScenePlanet = {
  block?: ChainBlock
  color: string
  failedTxRatio: number
  hot: boolean
  id: number
  orbit: OrbitSpec
  program?: ProgramRollup
  recency: number
  size: number
  title: string
  category: ActivityCategory
  variant: PlanetVariant
}

type OrbitSpec = {
  radiusX: number
  radiusZ: number
  angle: number
  speed: number
  tilt: number
  y: number
}

type ActiveScene = 'ecosystem' | 'destination'
type WarpDirection = 'to-destination' | 'to-ecosystem'

const categoryColors: Record<ActivityCategory, string> = {
  defi: '#9b3fff',
  token: '#28ffe7',
  nft: '#39ff88',
  other: '#ff6f61',
}
const categoryLabels: Record<ActivityCategory, string> = {
  defi: 'DeFi',
  token: 'Token',
  nft: 'NFT',
  other: 'Other',
}
const worldTypeLabels: Record<ActivityCategory, string> = {
  defi: 'Gas giant = DeFi',
  token: 'Ocean = Token',
  nft: 'Verdant = NFT',
  other: 'Rocky = Other',
}
const activityCategories: ActivityCategory[] = ['defi', 'token', 'nft', 'other']
const sunRadius = 0.78
const sunGlowRadiusRatio = 1.48
const sunClearanceMarginRatio = 1.85
const orbitSurfaceMarginRatio = 0.38
const orbitZAspect = 0.88
const destinationSunActivityScale = {
  maxRadius: 1.24,
  maxTxns: 650,
  minRadius: 0.68,
  minTxns: 1,
  type: 'log',
} as const
const defaultVisibleBlockCount = 30
const minProgramPlanetRadius = 0.28
const maxProgramPlanetRadius = 0.62
const defaultSearchPlaceholder = 'Search program or paste program ID'
const warpDurationMs = 6200
const reducedMotionWarpDurationMs = 520

const variantFallbacks: Record<ActivityCategory, PlanetVariant[]> = {
  defi: ['defi-generic', 'defi-storm', 'defi-ice', 'defi-nebula'],
  token: ['token-generic', 'token-aqua', 'token-cloud', 'token-deep'],
  nft: ['nft-generic', 'verdant-emerald', 'verdant-lime', 'verdant-moss'],
  other: ['other-generic', 'rocky-cratered', 'rocky-ice', 'rocky-iron'],
}

const knownProgramAliases = new Map([
  ['JUP2jxvS5ji3Yj2hfRCKW3tnL3hq6h3JNsxFYgNn3n9', 'Jupiter'],
  ['JUP3c2Uhhu0g8Q6NDtY9CgzGbSadtWSJbAQGtD2q7SU', 'Jupiter'],
  ['JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB', 'Jupiter'],
  ['JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', 'Jupiter'],
  ['6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', 'Pump.fun'],
  ['675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', 'Raydium'],
  ['CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', 'Raydium'],
  ['CAMMCzo5YL8w4VFF8KVHrK22GGUQpVTaW7grrKgrWqK', 'Raydium'],
  ['CPMMoo8L3F4NbTegBCKVNwbryeYbJ4YF9t4r5gn1s9y', 'Raydium'],
  ['5quBtoiQqxF9J9tYNNQDPqBrVgbGpxRFNZbQeTeM2UZa', 'Raydium'],
  ['cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG', 'Pump.fun'],
  ['Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB', 'Meteora'],
  ['LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo', 'Meteora'],
  ['opnb2LAfJYbCnR3Z6BhQGbn2zfgPioEFrB37LdkP7gj', 'OpenBook'],
  ['pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA', 'Pump.fun'],
  ['whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', 'Orca'],
  ['9W959DqEETiGZocYWCQPaJ6nK9joxTywcxSUGWNA3Y3r', 'Orca'],
  ['9xQeWvG816bUx9EPf7W6WMAaQ2X5rJjZA8tE7Rj1U4q', 'Serum'],
  ['PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY', 'Phoenix'],
  ['srmqPvymJeFKQ4XrEN2o33bJ87fdLhRZSF6tJkQKzJr', 'OpenBook'],
  ['11111111111111111111111111111111', 'System'],
  ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'SPL Token'],
  ['TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', 'Token-2022'],
  ['M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K', 'Magic Eden'],
  ['TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp', 'Tensor'],
  ['TAMM6ub33ij1mbetoMyVBLeKY5iP41i4UPUJQGkhfsg', 'Tensor'],
  ['metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s', 'Metaplex'],
])

const variantSpin: Record<PlanetVariant, number> = {
  'defi-generic': 0.92,
  'defi-ice': 0.66,
  'defi-nebula': 1.16,
  'defi-storm': 1.3,
  jupiter: 0.72,
  meteora: 1.1,
  orca: 0.58,
  openbook: 0.82,
  phoenix: 1.08,
  'pump-fun': 1.38,
  raydium: 1.18,
  serum: 0.76,
  system: 0.7,
  'spl-token': 1.02,
  'token-aqua': 1.16,
  'token-cloud': 0.82,
  'token-deep': 0.68,
  'token-2022': 1.26,
  'token-generic': 0.94,
  'magic-eden': 0.88,
  metaplex: 0.78,
  'nft-generic': 0.96,
  tensor: 1.22,
  'verdant-emerald': 1.06,
  'verdant-lime': 0.92,
  'verdant-moss': 0.7,
  'other-generic': 0.74,
  'rocky-cratered': 0.62,
  'rocky-grey': 0.68,
  'rocky-ice': 0.58,
  'rocky-iron': 0.86,
  'rocky-red': 0.82,
}

const visualPolish = {
  bloom: {
    intensity: 1.05,
    luminanceSmoothing: 0.16,
    luminanceThreshold: 0.66,
    radius: 0.52,
  },
  float: {
    x: 0.075,
    y: 0.052,
    z: 0.045,
  },
}

function getDefaultCameraPosition(isNarrow: boolean) {
  return new Vector3(0, isNarrow ? 12.8 : 12.2, isNarrow ? 19.5 : 17.6)
}

function getSystemScale(isNarrow: boolean, maxOrbitRadius: number) {
  return Math.min(isNarrow ? 0.5 : 0.88, (isNarrow ? 8.4 : 10.8) / maxOrbitRadius)
}

function getVisibleBlockCount() {
  const configuredCount = Number(import.meta.env.VITE_BLOCK_COUNT)
  return Number.isFinite(configuredCount) && configuredCount > 0
    ? Math.floor(configuredCount)
    : defaultVisibleBlockCount
}

function getInitialFocusBlockId() {
  const rawFocusBlockId = new URLSearchParams(window.location.search).get('focusBlock')
  if (rawFocusBlockId === null) {
    return null
  }

  const focusBlockId = Number(rawFocusBlockId)
  return Number.isInteger(focusBlockId) && focusBlockId >= 0 ? focusBlockId : null
}

function getInitialFocusProgramId() {
  const rawFocusProgramId = new URLSearchParams(window.location.search).get('focusProgram')
  if (rawFocusProgramId === null) {
    return null
  }

  const focusProgramId = Number(rawFocusProgramId)
  return Number.isInteger(focusProgramId) && focusProgramId >= 0
    ? focusProgramId
    : null
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches)

    updatePreference()
    mediaQuery.addEventListener('change', updatePreference)

    return () => mediaQuery.removeEventListener('change', updatePreference)
  }, [])

  return prefersReducedMotion
}

function resolvePlanetVariantFromProgram(
  category: ActivityCategory,
  programName: string | null | undefined,
  index: number,
): PlanetVariant {
  const normalizedProgramName =
    knownProgramAliases.get(programName ?? '')?.toLowerCase() ??
    programName?.toLowerCase() ??
    ''

  if (category === 'defi') {
    if (normalizedProgramName.includes('pump')) return 'pump-fun'
    if (normalizedProgramName.includes('meteora')) return 'meteora'
    if (normalizedProgramName.includes('openbook')) return 'openbook'
    if (normalizedProgramName.includes('raydium')) return 'raydium'
    if (normalizedProgramName.includes('orca')) return 'orca'
    if (normalizedProgramName.includes('jupiter')) return 'jupiter'
    if (normalizedProgramName.includes('phoenix')) return 'phoenix'
    if (normalizedProgramName.includes('serum')) return 'serum'
  }

  if (category === 'token') {
    if (normalizedProgramName.includes('token-2022')) return 'token-2022'
    if (normalizedProgramName.includes('system')) return 'system'
    if (
      normalizedProgramName.includes('spl') ||
      normalizedProgramName.includes('token')
    ) {
      return 'spl-token'
    }
  }

  if (category === 'nft') {
    if (normalizedProgramName.includes('magic')) return 'magic-eden'
    if (normalizedProgramName.includes('tensor')) return 'tensor'
    if (normalizedProgramName.includes('metaplex')) return 'metaplex'
  }

  if (category === 'other') {
    if (normalizedProgramName.includes('system')) return 'rocky-grey'
    if (normalizedProgramName.includes('memo')) return 'rocky-red'
    if (normalizedProgramName) return 'rocky-cratered'
  }

  const fallbacks = variantFallbacks[category]
  return fallbacks[index % fallbacks.length]
}

function resolvePlanetVariant(block: ChainBlock, index: number): PlanetVariant {
  return resolvePlanetVariantFromProgram(
    block.dominantCategory,
    block.dominantProgram,
    index,
  )
}

function getDestinationSunRadius(activityMagnitude: number) {
  const clampedTxns = Math.min(
    destinationSunActivityScale.maxTxns,
    Math.max(destinationSunActivityScale.minTxns, activityMagnitude),
  )
  const minValue = Math.log1p(destinationSunActivityScale.minTxns)
  const maxValue = Math.log1p(destinationSunActivityScale.maxTxns)
  const scaledValue =
    destinationSunActivityScale.type === 'log'
      ? Math.log1p(clampedTxns)
      : Math.sqrt(clampedTxns)
  const scaledMin =
    destinationSunActivityScale.type === 'log'
      ? minValue
      : Math.sqrt(destinationSunActivityScale.minTxns)
  const scaledMax =
    destinationSunActivityScale.type === 'log'
      ? maxValue
      : Math.sqrt(destinationSunActivityScale.maxTxns)
  const activityWeight = (scaledValue - scaledMin) / Math.max(1, scaledMax - scaledMin)
  const radius =
    destinationSunActivityScale.minRadius +
    activityWeight *
      (destinationSunActivityScale.maxRadius - destinationSunActivityScale.minRadius)

  return Number(radius.toFixed(3))
}

function getDestinationActivityMagnitude(
  activityResult: ProgramActivityResult | null,
  program: ProgramRollup | null,
) {
  if (activityResult && activityResult.programId === program?.programId) {
    return activityResult.totalTxns
  }

  return program?.totalTxns ?? 0
}

function createOrbitSpecs(
  planets: Pick<ScenePlanet, 'size'>[],
  centerSunRadius = sunRadius,
): OrbitSpec[] {
  const startingAngles = [1.12, 2.62, 0.42, 3.14, 0.88, 2.08, 0.08, 1.62]
  const maxPlanetRadius = Math.max(...planets.map((planet) => planet.size), 0.3)
  const centerSunGlowRadius = centerSunRadius * sunGlowRadiusRatio
  const centerSunClearanceMargin = centerSunRadius * sunClearanceMarginRatio
  const centerOrbitSurfaceMargin = centerSunRadius * orbitSurfaceMarginRatio
  let currentRadius =
    (centerSunGlowRadius + maxPlanetRadius + centerSunClearanceMargin) /
    orbitZAspect

  return planets.map((planet, index) => {
    if (index > 0) {
      const previousRadius = planets[index - 1].size
      const currentPlanetRadius = planet.size
      currentRadius +=
        (previousRadius + currentPlanetRadius + centerOrbitSurfaceMargin) /
        orbitZAspect
    }

    const progress = planets.length <= 1 ? 0 : index / (planets.length - 1)

    return {
      angle: startingAngles[index % startingAngles.length],
      radiusX: currentRadius * (1.05 + Math.sin(index * 1.2) * 0.014),
      radiusZ: currentRadius * orbitZAspect,
      speed: 0.095 - progress * 0.055,
      tilt: -0.12 + Math.sin(index * 0.82) * 0.08,
      y: (index % 3 - 1) * 0.08,
    }
  })
}

function getOrbitPosition(orbit: OrbitSpec, angle: number) {
  const orbitSin = Math.sin(angle)
  return new Vector3(
    Math.cos(angle) * orbit.radiusX,
    orbit.y + orbitSin * Math.sin(orbit.tilt) * orbit.radiusZ,
    orbitSin * orbit.radiusZ,
  )
}

function BlockchainScene({
  planets,
  deselectSignal,
  emptyMessage,
  initialFocusBlockId,
  onHoverBlock,
  prefersReducedMotion,
  selectedBlockId,
  setSelectedBlockId,
  sunColor = '#ffb347',
  sunLabel = 'Solana Mainnet',
  sunRadius: sceneSunRadius = sunRadius,
  sunSubLabel,
}: {
  planets: ScenePlanet[]
  deselectSignal: number
  emptyMessage?: string
  initialFocusBlockId: number | null
  onHoverBlock: (isHovering: boolean) => void
  prefersReducedMotion: boolean
  selectedBlockId: number | null
  setSelectedBlockId: (id: number | null) => void
  sunColor?: string
  sunLabel?: string
  sunRadius?: number
  sunSubLabel?: string
}) {
  const galaxyRef = useRef<Group>(null)
  const controlsRef = useRef<ElementRef<typeof OrbitControls>>(null)
  const resumeRotationRef = useRef<number | undefined>(undefined)
  const [resumeDelayActive, setResumeDelayActive] = useState(false)
  const { camera, size } = useThree()
  const isNarrow = size.width < 640
  const baseGroupPosition = useMemo(
    () => new Vector3(0, isNarrow ? -0.72 : -0.2, 0),
    [isNarrow],
  )
  const maxOrbitRadius = useMemo(
    () =>
      Math.max(
        ...planets.map((planet) =>
          Math.max(planet.orbit.radiusX, planet.orbit.radiusZ),
        ),
        sceneSunRadius * sunGlowRadiusRatio * 2.4,
        1,
      ),
    [planets, sceneSunRadius],
  )
  const systemScale = getSystemScale(isNarrow, maxOrbitRadius)
  const planetTextures = useMemo(
    () => ({
      'defi-generic': createPlanetTextureSet('defi', 'defi-generic'),
      'defi-ice': createPlanetTextureSet('defi', 'defi-ice'),
      'defi-nebula': createPlanetTextureSet('defi', 'defi-nebula'),
      'defi-storm': createPlanetTextureSet('defi', 'defi-storm'),
      jupiter: createPlanetTextureSet('defi', 'jupiter'),
      meteora: createPlanetTextureSet('defi', 'meteora'),
      orca: createPlanetTextureSet('defi', 'orca'),
      openbook: createPlanetTextureSet('defi', 'openbook'),
      phoenix: createPlanetTextureSet('defi', 'phoenix'),
      'pump-fun': createPlanetTextureSet('defi', 'pump-fun'),
      raydium: createPlanetTextureSet('defi', 'raydium'),
      serum: createPlanetTextureSet('defi', 'serum'),
      system: createPlanetTextureSet('token', 'system'),
      'spl-token': createPlanetTextureSet('token', 'spl-token'),
      'token-aqua': createPlanetTextureSet('token', 'token-aqua'),
      'token-cloud': createPlanetTextureSet('token', 'token-cloud'),
      'token-deep': createPlanetTextureSet('token', 'token-deep'),
      'token-2022': createPlanetTextureSet('token', 'token-2022'),
      'token-generic': createPlanetTextureSet('token', 'token-generic'),
      'magic-eden': createPlanetTextureSet('nft', 'magic-eden'),
      metaplex: createPlanetTextureSet('nft', 'metaplex'),
      'nft-generic': createPlanetTextureSet('nft', 'nft-generic'),
      tensor: createPlanetTextureSet('nft', 'tensor'),
      'verdant-emerald': createPlanetTextureSet('nft', 'verdant-emerald'),
      'verdant-lime': createPlanetTextureSet('nft', 'verdant-lime'),
      'verdant-moss': createPlanetTextureSet('nft', 'verdant-moss'),
      'other-generic': createPlanetTextureSet('other', 'other-generic'),
      'rocky-cratered': createPlanetTextureSet('other', 'rocky-cratered'),
      'rocky-grey': createPlanetTextureSet('other', 'rocky-grey'),
      'rocky-ice': createPlanetTextureSet('other', 'rocky-ice'),
      'rocky-iron': createPlanetTextureSet('other', 'rocky-iron'),
      'rocky-red': createPlanetTextureSet('other', 'rocky-red'),
    }),
    [],
  )

  const flyCamera = useCallback(
    (position: Vector3, target: Vector3, duration = 1.32) => {
      const controls = controlsRef.current

      gsap.killTweensOf(camera.position)
      if (controls) {
        gsap.killTweensOf(controls.target)
      }

      gsap.to(camera.position, {
        duration,
        ease: 'power3.inOut',
        x: position.x,
        y: position.y,
        z: position.z,
        onUpdate: () => controls?.update(),
      })
      if (controls) {
        gsap.to(controls.target, {
          duration,
          ease: 'power3.inOut',
          x: target.x,
          y: target.y,
          z: target.z,
          onUpdate: () => controls.update(),
        })
      }
    },
    [camera],
  )

  const handleSelectBlock = useCallback(
    (id: number, worldPosition: Vector3) => {
      if (resumeRotationRef.current) {
        window.clearTimeout(resumeRotationRef.current)
      }
      setResumeDelayActive(false)

      const planet = planets[id]

      if (!planet) {
        return
      }

      const target = worldPosition.clone()
      const cameraDirection = camera.position.clone().sub(worldPosition).normalize()
      const focusPosition = worldPosition
        .clone()
        .add(cameraDirection.multiplyScalar(isNarrow ? 5.2 : 4.6))
        .add(new Vector3(0, isNarrow ? 0.42 : 0.28, 0))

      setSelectedBlockId(id)
      flyCamera(focusPosition, target)
    },
    [planets, camera.position, flyCamera, isNarrow, setSelectedBlockId],
  )

  const handleDeselect = useCallback(() => {
    setSelectedBlockId(null)
    flyCamera(getDefaultCameraPosition(isNarrow), new Vector3(0, 0, 0), 1.24)

    if (resumeRotationRef.current) {
      window.clearTimeout(resumeRotationRef.current)
    }
    setResumeDelayActive(true)
    resumeRotationRef.current = window.setTimeout(() => {
      resumeRotationRef.current = undefined
      setResumeDelayActive(false)
    }, 2600)
  }, [flyCamera, isNarrow, setSelectedBlockId])

  useEffect(() => {
    if (selectedBlockId === null && !resumeDelayActive) {
      camera.position.copy(getDefaultCameraPosition(isNarrow))
      controlsRef.current?.target.set(0, 0, 0)
      controlsRef.current?.update()
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()
    }
  }, [camera, isNarrow, resumeDelayActive, selectedBlockId])

  useEffect(() => {
    if (deselectSignal > 0) {
      const timeoutId = window.setTimeout(handleDeselect, 0)

      return () => window.clearTimeout(timeoutId)
    }
  }, [deselectSignal, handleDeselect])

  useEffect(() => {
    return () => {
      if (resumeRotationRef.current) {
        window.clearTimeout(resumeRotationRef.current)
      }
    }
  }, [])

  useFrame(({ clock }) => {
    if (!galaxyRef.current) {
      return
    }

    if (selectedBlockId === null && !resumeDelayActive) {
      galaxyRef.current.rotation.x = prefersReducedMotion
        ? 0
        : Math.sin(clock.elapsedTime * 0.16) * 0.035

      if (!prefersReducedMotion) {
        galaxyRef.current.position.set(
          baseGroupPosition.x + Math.sin(clock.elapsedTime * 0.21) * visualPolish.float.x,
          baseGroupPosition.y +
            Math.sin(clock.elapsedTime * 0.27 + 1.2) * visualPolish.float.y,
          baseGroupPosition.z +
            Math.sin(clock.elapsedTime * 0.18 + 2.1) * visualPolish.float.z,
        )
      }
    } else {
      galaxyRef.current.position.lerp(baseGroupPosition, 0.08)
    }
  })

  return (
    <>
      <color attach="background" args={['#070d22']} />
      <fog attach="fog" args={['#070d22', 18, 38]} />
      <ambientLight color="#8fa7cf" intensity={0.18} />
      <hemisphereLight
        args={['#8ea8d8', '#050611', 0.34]}
        position={[0, 8, -12]}
      />
      <pointLight
        color="#6f85b8"
        decay={1.7}
        distance={30}
        intensity={18}
        position={[0, 8, -18]}
      />
      <Stars
        radius={110}
        depth={60}
        count={1900}
        factor={4.2}
        saturation={0.35}
        fade
        speed={0.45}
      />
      <group
        ref={galaxyRef}
        position={baseGroupPosition}
        scale={systemScale}
      >
        <Sun color={sunColor} radius={sceneSunRadius} />
        <Text
          anchorX="center"
          anchorY="middle"
          color="#fff8cf"
          fontSize={0.22}
          outlineBlur={0.04}
          outlineColor={sunColor}
          outlineOpacity={0.32}
          position={[0, sceneSunRadius * 1.72, 0]}
        >
          {sunLabel}
        </Text>
        {sunSubLabel && (
          <Text
            anchorX="center"
            anchorY="middle"
            color="#b9d7ff"
            fontSize={0.13}
            outlineBlur={0.025}
            outlineColor="#000000"
            outlineOpacity={0.24}
            position={[0, sceneSunRadius * 1.36, 0]}
          >
            {sunSubLabel}
          </Text>
        )}
        {planets.length === 0 && emptyMessage && (
          <Text
            anchorX="center"
            anchorY="middle"
            color="#d9ebff"
            fontSize={0.16}
            maxWidth={3.4}
            outlineBlur={0.03}
            outlineColor="#000000"
            outlineOpacity={0.3}
            position={[0, -sceneSunRadius * 1.36, 0]}
            textAlign="center"
          >
            {emptyMessage}
          </Text>
        )}
        {planets.map((planet) => (
          <OrbitLine key={`orbit-${planet.id}`} orbit={planet.orbit} />
        ))}
        {planets.map((planet, index) => {
          const textures = planetTextures[planet.variant]

          return (
            <OrbitingPlanet
              planet={planet}
              cityLightsMap={textures.cityLightsMap}
              initialFocusBlockId={initialFocusBlockId}
              isMotionPaused={
                selectedBlockId !== null || prefersReducedMotion
              }
              id={index}
              isSelected={selectedBlockId === index}
              key={index}
              onHoverChange={onHoverBlock}
              onSelect={handleSelectBlock}
              surfaceMap={textures.surfaceMap}
            />
          )
        })}
      </group>
      <OrbitControls
        autoRotate={false}
        dampingFactor={0.06}
        enableDamping
        enablePan={false}
        maxDistance={34}
        minDistance={6.4}
        ref={controlsRef}
      />
    </>
  )
}

function OrbitingPlanet({
  planet,
  cityLightsMap,
  id,
  initialFocusBlockId,
  isMotionPaused,
  isSelected,
  onHoverChange,
  onSelect,
  surfaceMap,
}: {
  planet: ScenePlanet
  cityLightsMap: ReturnType<typeof createPlanetTextureSet>['cityLightsMap']
  id: number
  initialFocusBlockId: number | null
  isMotionPaused: boolean
  isSelected: boolean
  onHoverChange: (isHovering: boolean) => void
  onSelect: (id: number, position: Vector3) => void
  surfaceMap: ReturnType<typeof createPlanetTextureSet>['surfaceMap']
}) {
  const groupRef = useRef<Group>(null)
  const hasAutoFocusedRef = useRef(false)
  const localOrigin = useMemo(() => new Vector3(0, 0, 0), [])
  const angleRef = useRef(planet.orbit.angle)

  useEffect(() => {
    if (
      hasAutoFocusedRef.current ||
      initialFocusBlockId !== id ||
      !groupRef.current
    ) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const worldPosition = getOrbitPosition(planet.orbit, angleRef.current)
      groupRef.current?.parent?.localToWorld(worldPosition)
      hasAutoFocusedRef.current = true
      onSelect(id, worldPosition)
    }, 260)

    return () => window.clearTimeout(timeoutId)
  }, [planet.orbit, id, initialFocusBlockId, onSelect])

  useFrame(({ clock }, delta) => {
    const group = groupRef.current

    if (!group) {
      return
    }

    if (!isMotionPaused) {
      angleRef.current += delta * planet.orbit.speed
    }

    const angle = angleRef.current
    group.position.copy(getOrbitPosition(planet.orbit, angle))

    if (!isMotionPaused) {
      group.rotation.y +=
        (0.0055 + planet.recency * 0.0035) * variantSpin[planet.variant]
      group.rotation.z = Math.sin(clock.elapsedTime * 0.2 + id) * 0.035
    }
  })

  return (
    <group ref={groupRef}>
      <Block
        categoryColor={planet.color}
        cityLightsMap={cityLightsMap}
        failedTxRatio={planet.failedTxRatio}
        hasRing={planet.category === 'defi' && planet.size >= 0.44}
        hot={planet.hot}
        id={id}
        isSelected={isSelected}
        onHoverChange={onHoverChange}
        onSelect={onSelect}
        position={localOrigin}
        recency={planet.recency}
        size={planet.size}
        surfaceMap={surfaceMap}
      />
    </group>
  )
}

function OrbitLine({ orbit }: { orbit: OrbitSpec }) {
  const geometry = useMemo(() => {
    const points = Array.from({ length: 128 }, (_, index) => {
      const angle = (index / 128) * Math.PI * 2
      return new Vector3(
        Math.cos(angle) * orbit.radiusX,
        orbit.y + Math.sin(angle) * Math.sin(orbit.tilt) * orbit.radiusZ,
        Math.sin(angle) * orbit.radiusZ,
      )
    })

    return new BufferGeometry().setFromPoints(points)
  }, [orbit])

  return (
    <lineLoop geometry={geometry}>
      <lineBasicMaterial color="#7891bb" opacity={0.18} transparent />
    </lineLoop>
  )
}

function createSolarGranulationTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 384
  canvas.height = 192
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas 2D context is unavailable.')
  }

  const baseGradient = context.createLinearGradient(0, 0, canvas.width, canvas.height)
  baseGradient.addColorStop(0, '#fff4a8')
  baseGradient.addColorStop(0.34, '#ffbd55')
  baseGradient.addColorStop(0.68, '#ff7b32')
  baseGradient.addColorStop(1, '#df472c')
  context.fillStyle = baseGradient
  context.fillRect(0, 0, canvas.width, canvas.height)

  for (let y = -12; y < canvas.height + 24; y += 16) {
    for (let x = -12; x < canvas.width + 24; x += 18) {
      const noise = Math.sin(x * 0.13 + y * 0.19) + Math.cos(x * 0.09 - y * 0.21)
      const radius = 6 + Math.abs(noise) * 4
      const granule = context.createRadialGradient(x, y, 0, x, y, radius)

      granule.addColorStop(0, noise > 0 ? 'rgb(255 255 215 / 0.42)' : 'rgb(255 92 38 / 0.3)')
      granule.addColorStop(0.58, noise > 0 ? 'rgb(255 191 77 / 0.24)' : 'rgb(185 46 33 / 0.28)')
      granule.addColorStop(1, 'rgb(54 8 12 / 0)')
      context.fillStyle = granule
      context.beginPath()
      context.arc(x, y, radius, 0, Math.PI * 2)
      context.fill()
    }
  }

  context.globalCompositeOperation = 'screen'
  context.lineWidth = 2.2
  context.lineCap = 'round'

  for (let index = 0; index < 26; index += 1) {
    const y = 18 + ((index * 37) % canvas.height)
    const amplitude = 5 + (index % 5) * 1.8

    context.beginPath()
    for (let x = 0; x <= canvas.width; x += 8) {
      const waveY =
        y +
        Math.sin(x * 0.036 + index * 1.7) * amplitude +
        Math.sin(x * 0.083 + index) * 2

      if (x === 0) {
        context.moveTo(x, waveY)
      } else {
        context.lineTo(x, waveY)
      }
    }
    context.strokeStyle =
      index % 3 === 0 ? 'rgb(255 250 185 / 0.28)' : 'rgb(255 115 54 / 0.18)'
    context.stroke()
  }

  context.globalCompositeOperation = 'multiply'
  context.fillStyle = 'rgb(118 20 24 / 0.16)'
  context.fillRect(0, 0, canvas.width, canvas.height)

  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(1.55, 1.12)
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.needsUpdate = true

  return texture
}

function Sun({
  color = '#ffb347',
  radius = sunRadius,
}: {
  color?: string
  radius?: number
}) {
  const surfaceRef = useRef<Group>(null)
  const flareOneRef = useRef<Group>(null)
  const flareTwoRef = useRef<Group>(null)
  const flareThreeRef = useRef<Group>(null)
  const coronaRef = useRef<Group>(null)
  const hotShellMaterialRef = useRef<MeshBasicMaterial>(null)
  const innerCoronaMaterialRef = useRef<MeshBasicMaterial>(null)
  const outerCoronaMaterialRef = useRef<MeshBasicMaterial>(null)
  const flareOneMaterialRef = useRef<MeshBasicMaterial>(null)
  const flareTwoMaterialRef = useRef<MeshBasicMaterial>(null)
  const flareThreeMaterialRef = useRef<MeshBasicMaterial>(null)
  const surfaceMap = useMemo(() => createSolarGranulationTexture(), [])

  useFrame(({ clock }) => {
    const elapsed = clock.elapsedTime

    if (surfaceRef.current) {
      const convectionPulse =
        1 + Math.sin(elapsed * 1.6) * 0.006 + Math.sin(elapsed * 2.7) * 0.004

      surfaceRef.current.rotation.y = elapsed * 0.105
      surfaceRef.current.rotation.x = Math.sin(elapsed * 0.22) * 0.025
      surfaceRef.current.rotation.z = Math.sin(elapsed * 0.34) * 0.035
      surfaceRef.current.scale.setScalar(convectionPulse)
    }

    if (hotShellMaterialRef.current) {
      hotShellMaterialRef.current.opacity =
        0.16 + Math.sin(elapsed * 2.9) * 0.028 + Math.sin(elapsed * 5.1) * 0.014
    }

    if (flareOneRef.current) {
      const flareScale = 1 + Math.sin(elapsed * 1.8) * 0.08

      flareOneRef.current.rotation.z = elapsed * 0.18
      flareOneRef.current.rotation.y = Math.sin(elapsed * 0.44) * 0.16
      flareOneRef.current.scale.set(1.16 * flareScale, 0.64, 1)
    }

    if (flareTwoRef.current) {
      const flareScale = 1 + Math.sin(elapsed * 1.35 + 1.7) * 0.1

      flareTwoRef.current.rotation.z = -elapsed * 0.13
      flareTwoRef.current.rotation.x = Math.sin(elapsed * 0.39 + 0.8) * 0.13
      flareTwoRef.current.scale.set(0.76, 1.24 * flareScale, 1)
    }

    if (flareThreeRef.current) {
      const flareScale = 1 + Math.sin(elapsed * 1.1 + 2.4) * 0.12

      flareThreeRef.current.rotation.z = elapsed * 0.11
      flareThreeRef.current.rotation.y = Math.sin(elapsed * 0.31 + 1.2) * 0.18
      flareThreeRef.current.scale.set(1.28 * flareScale, 0.78, 1)
    }

    if (flareOneMaterialRef.current) {
      flareOneMaterialRef.current.opacity = 0.46 + Math.sin(elapsed * 3.4) * 0.12
    }

    if (flareTwoMaterialRef.current) {
      flareTwoMaterialRef.current.opacity = 0.32 + Math.sin(elapsed * 2.8 + 1.1) * 0.1
    }

    if (flareThreeMaterialRef.current) {
      flareThreeMaterialRef.current.opacity = 0.18 + Math.sin(elapsed * 2.1 + 2.2) * 0.07
    }

    if (coronaRef.current) {
      const pulse =
        1 + Math.sin(elapsed * 1.15) * 0.028 + Math.sin(elapsed * 2.35) * 0.01
      coronaRef.current.scale.setScalar(pulse)
      coronaRef.current.rotation.z = -elapsed * 0.055
    }

    if (innerCoronaMaterialRef.current) {
      innerCoronaMaterialRef.current.opacity = 0.1 + Math.sin(elapsed * 1.7) * 0.026
    }

    if (outerCoronaMaterialRef.current) {
      outerCoronaMaterialRef.current.opacity = 0.045 + Math.sin(elapsed * 1.15 + 0.7) * 0.014
    }
  })

  return (
    <group>
      <pointLight color="#fff0ba" decay={1.22} distance={26} intensity={300} />
      <group ref={surfaceRef}>
        <mesh>
          <sphereGeometry args={[radius, 72, 72]} />
          <meshBasicMaterial
            color="#fff0b2"
            map={surfaceMap}
            toneMapped={false}
          />
        </mesh>
        <mesh scale={1.015}>
          <sphereGeometry args={[radius, 72, 72]} />
          <meshBasicMaterial
            ref={hotShellMaterialRef}
            blending={AdditiveBlending}
            color="#ff6b32"
            depthWrite={false}
            opacity={0.18}
            toneMapped={false}
            transparent
          />
        </mesh>
      </group>
      <group ref={flareOneRef} rotation={[0.72, 0.18, -0.28]}>
        <mesh>
          <torusGeometry args={[radius * 1.08, 0.012, 8, 96, Math.PI * 1.18]} />
          <meshBasicMaterial
            ref={flareOneMaterialRef}
            blending={AdditiveBlending}
            color="#ff8d3d"
            depthWrite={false}
            opacity={0.58}
            toneMapped={false}
            transparent
          />
        </mesh>
      </group>
      <group ref={flareTwoRef} rotation={[-0.42, 0.48, 1.9]}>
        <mesh>
          <torusGeometry args={[radius * 1.2, 0.009, 8, 96, Math.PI * 0.82]} />
          <meshBasicMaterial
            ref={flareTwoMaterialRef}
            blending={AdditiveBlending}
            color="#ffd46a"
            depthWrite={false}
            opacity={0.4}
            toneMapped={false}
            transparent
          />
        </mesh>
      </group>
      <group ref={flareThreeRef} rotation={[1.18, -0.28, 2.82]}>
        <mesh>
          <torusGeometry args={[radius * 1.34, 0.007, 8, 96, Math.PI * 0.58]} />
          <meshBasicMaterial
            ref={flareThreeMaterialRef}
            blending={AdditiveBlending}
            color={color}
            depthWrite={false}
            opacity={0.25}
            toneMapped={false}
            transparent
          />
        </mesh>
      </group>
      <group ref={coronaRef}>
        <mesh scale={1.3}>
          <sphereGeometry args={[radius, 48, 48]} />
          <meshBasicMaterial
            ref={innerCoronaMaterialRef}
            blending={AdditiveBlending}
            color="#ff9b45"
            depthWrite={false}
            opacity={0.12}
            toneMapped={false}
            transparent
          />
        </mesh>
        <mesh scale={1.54}>
          <sphereGeometry args={[radius, 48, 48]} />
          <meshBasicMaterial
            ref={outerCoronaMaterialRef}
            blending={AdditiveBlending}
            color={color}
            depthWrite={false}
            opacity={0.055}
            toneMapped={false}
            transparent
          />
        </mesh>
      </group>
    </group>
  )
}

function createBlockPlanets(blocks: ChainBlock[], orbitSpecs: OrbitSpec[]) {
  return blocks.map<ScenePlanet>((block, index) => ({
    block,
    category: block.dominantCategory,
    color: categoryColors[block.dominantCategory],
    failedTxRatio: block.failedTxRatio,
    hot: block.recency === 1,
    id: index,
    orbit: orbitSpecs[index],
    recency: block.recency,
    size: block.size,
    title: `Slot ${block.slot}`,
    variant: resolvePlanetVariant(block, index),
  }))
}

function createProgramActivityBlocks(
  activityResult: ProgramActivityResult | null,
  program: ProgramRollup | null,
): ChainBlock[] {
  if (!activityResult || !program) {
    return []
  }

  const orderedBlocks = [...activityResult.blocks].sort(
    (blockA, blockB) => blockA.slot - blockB.slot,
  )

  if (orderedBlocks.length === 0) {
    return []
  }

  const transactionWeights = orderedBlocks.map((block) =>
    Math.sqrt(Math.max(0, block.txCount)),
  )
  const minTransactions = Math.min(...transactionWeights)
  const maxTransactions = Math.max(...transactionWeights)
  const transactionRange = Math.max(1, maxTransactions - minTransactions)
  const count = Math.max(1, orderedBlocks.length - 1)

  return orderedBlocks.map((block, index) => {
    const enrichedBlock = getCachedBlockBySlot(block.slot)
    const recency = count === 0 ? 1 : index / count
    const transactionWeight =
      (Math.sqrt(Math.max(0, block.txCount)) - minTransactions) /
      transactionRange
    const size = Number(
      (
        minProgramPlanetRadius +
        transactionWeight * (maxProgramPlanetRadius - minProgramPlanetRadius)
      ).toFixed(3),
    )
    const categoryMix = {
      defi: 0,
      nft: 0,
      other: 0,
      token: 0,
      [program.category]: 1,
    } as CategoryMix
    const fallbackProgramCounts = {
      defi: 0,
      infra: 0,
      nft: 0,
      other: 0,
      token: 0,
      vote: 0,
      [program.category]: block.txCount,
    } as ProgramCounts
    const programCounts = enrichedBlock
      ? {
          ...enrichedBlock.programCounts,
          [program.category]: Math.max(
            enrichedBlock.programCounts[program.category],
            block.txCount,
          ),
        }
      : fallbackProgramCounts

    return {
      blockTime: enrichedBlock?.blockTime ?? null,
      categoryMix: enrichedBlock?.categoryMix ?? categoryMix,
      dominantCategory: enrichedBlock?.dominantCategory ?? program.category,
      dominantProgram:
        enrichedBlock?.dominantProgram ?? program.name ?? program.programId,
      failedTxRatio: enrichedBlock?.failedTxRatio ?? 0,
      programCounts,
      recency: enrichedBlock?.recency ?? recency,
      size,
      slot: block.slot,
      timestamp: enrichedBlock?.timestamp ?? block.timestamp,
      transactions: block.txCount,
    }
  })
}

function createProgramActivityPlanets(
  activityResult: ProgramActivityResult | null,
  program: ProgramRollup | null,
  centerSunRadius = sunRadius,
) {
  const blocks = createProgramActivityBlocks(activityResult, program)
  const orbitSpecs = createOrbitSpecs(blocks, centerSunRadius)

  return createBlockPlanets(blocks, orbitSpecs)
}

function createProgramSizeScale(programs: ProgramRollup[]) {
  const transactionWeights = programs.map((program) =>
    Math.sqrt(Math.max(0, program.totalTxns)),
  )
  const minTransactions = Math.min(...transactionWeights)
  const maxTransactions = Math.max(...transactionWeights)
  const transactionRange = Math.max(1, maxTransactions - minTransactions)

  return (program: ProgramRollup) => {
    const transactionWeight =
      (Math.sqrt(Math.max(0, program.totalTxns)) - minTransactions) /
      transactionRange

    return Number(
      (
        minProgramPlanetRadius +
        transactionWeight * (maxProgramPlanetRadius - minProgramPlanetRadius)
      ).toFixed(3),
    )
  }
}

function createProgramPlanets(programs: ProgramRollup[]) {
  const getProgramSize = createProgramSizeScale(programs)
  const basePlanets = programs.map((program, index) => ({
    category: program.category,
    color: categoryColors[program.category],
    failedTxRatio: 0,
    hot: index === 0,
    id: index,
    program,
    recency: programs.length <= 1 ? 1 : 1 - index / (programs.length - 1),
    size: getProgramSize(program),
    title: program.name ?? program.programId,
    variant: resolvePlanetVariantFromProgram(
      program.category,
      program.name ?? program.programId,
      index,
    ),
  }))
  const orbitSpecs = createOrbitSpecs(basePlanets)

  return basePlanets.map<ScenePlanet>((planet, index) => ({
    ...planet,
    orbit: orbitSpecs[index],
  }))
}

export function RecentBlocksGalaxy() {
  const visibleBlockCount = getVisibleBlockCount()
  const initialFocusBlockId = useMemo(() => getInitialFocusBlockId(), [])
  const chainData = useSolanaBlocks(visibleBlockCount)
  const prefersReducedMotion = usePrefersReducedMotion()
  const orbitSpecs = useMemo(
    () => createOrbitSpecs(chainData.blocks),
    [chainData.blocks],
  )
  const blocks = useMemo<ScenePlanet[]>(
    () => createBlockPlanets(chainData.blocks, orbitSpecs),
    [chainData.blocks, orbitSpecs],
  )
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(
    initialFocusBlockId,
  )
  const [deselectSignal, setDeselectSignal] = useState(0)
  const [isHoveringBlock, setIsHoveringBlock] = useState(false)
  const [showLegend, setShowLegend] = useState(true)
  const selectedBlock =
    selectedBlockId === null ? null : (blocks[selectedBlockId] ?? null)

  return (
    <main className="galaxy-shell">
      <div className="galaxy-title" aria-hidden="true">
        <h1>Blockchain Galaxy</h1>
        <p>Recent Solana blocks orbiting a live-data sun.</p>
      </div>
      {showLegend && <CategoryLegend onDismiss={() => setShowLegend(false)} />}
      <BlockInfoPanel selectedBlock={selectedBlock} source={chainData.source} />
      <Canvas
        camera={{ position: [0, 12.2, 17.6], fov: 48, rotation: [-0.606, 0, 0] }}
        className={`galaxy-canvas ${isHoveringBlock ? 'is-hovering-block' : ''}`}
        dpr={0.85}
        gl={{ antialias: true, toneMapping: ACESFilmicToneMapping }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
        onPointerMissed={() => setDeselectSignal((signal) => signal + 1)}
      >
        <BlockchainScene
          planets={blocks}
          deselectSignal={deselectSignal}
          initialFocusBlockId={initialFocusBlockId}
          onHoverBlock={setIsHoveringBlock}
          prefersReducedMotion={prefersReducedMotion}
          selectedBlockId={selectedBlockId}
          setSelectedBlockId={setSelectedBlockId}
        />
      </Canvas>
    </main>
  )
}

export function Galaxy() {
  const shellRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const warpTimeoutRef = useRef<number | undefined>(undefined)
  const programRollup = useMemo(() => getCachedProgramRollup(), [])
  const initialFocusProgramId = useMemo(() => getInitialFocusProgramId(), [])
  const prefersReducedMotion = usePrefersReducedMotion()
  const planets = useMemo(
    () => createProgramPlanets(programRollup.topPrograms),
    [programRollup.topPrograms],
  )
  const initialProgram = initialFocusProgramId === null
    ? null
    : (planets[initialFocusProgramId]?.program ?? null)
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(
    initialFocusProgramId,
  )
  const [activeScene, setActiveScene] = useState<ActiveScene>('ecosystem')
  const [warpDirection, setWarpDirection] = useState<WarpDirection | null>(null)
  const [destinationProgram, setDestinationProgram] =
    useState<ProgramRollup | null>(initialProgram)
  const [deselectSignal, setDeselectSignal] = useState(0)
  const [isHoveringProgram, setIsHoveringProgram] = useState(false)
  const [showLegend, setShowLegend] = useState(true)
  const [searchValue, setSearchValue] = useState(
    initialProgram?.name ?? initialProgram?.programId ?? '',
  )
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [activeProgramId, setActiveProgramId] = useState<string | null>(
    initialProgram?.programId ?? null,
  )
  const [activityResult, setActivityResult] =
    useState<ProgramActivityResult | null>(null)
  const [selectedDestinationBlockId, setSelectedDestinationBlockId] =
    useState<number | null>(null)
  const selectedProgram =
    selectedProgramId === null ? null : (planets[selectedProgramId] ?? null)
  const activityStatus =
    activeProgramId === null
      ? 'idle'
      : activityResult?.programId === activeProgramId
        ? 'ready'
        : 'loading'
  const popularPrograms = useMemo(
    () => programRollup.topPrograms.filter((program) => program.name !== null),
    [programRollup.topPrograms],
  )
  const destinationSunRadius = useMemo(
    () =>
      getDestinationSunRadius(
        getDestinationActivityMagnitude(activityResult, destinationProgram),
      ),
    [activityResult, destinationProgram],
  )
  const destinationPlanets = useMemo(
    () =>
      createProgramActivityPlanets(
        activityResult,
        destinationProgram,
        destinationSunRadius,
      ),
    [activityResult, destinationProgram, destinationSunRadius],
  )
  const selectedDestinationBlock =
    selectedDestinationBlockId === null
      ? null
      : (destinationPlanets[selectedDestinationBlockId] ?? null)
  const destinationSource = activityResult?.source ?? 'cached'
  const isWarping = warpDirection !== null

  useLayoutEffect(() => {
    const shell = shellRef.current
    const title = titleRef.current

    if (!shell || !title) {
      return
    }

    const updateTitleHeight = () => {
      const titleHeight = Math.ceil(title.getBoundingClientRect().height)
      shell.style.setProperty('--title-block-height', `${titleHeight + 30}px`)
    }
    const resizeObserver = new ResizeObserver(updateTitleHeight)

    updateTitleHeight()
    resizeObserver.observe(title)
    window.addEventListener('resize', updateTitleHeight)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateTitleHeight)
    }
  }, [])

  const finishWarpAfter = useCallback(
    (direction: WarpDirection) => {
      if (warpTimeoutRef.current) {
        window.clearTimeout(warpTimeoutRef.current)
      }

      const duration = prefersReducedMotion
        ? reducedMotionWarpDurationMs
        : warpDurationMs
      warpTimeoutRef.current = window.setTimeout(() => {
        setActiveScene(direction === 'to-destination' ? 'destination' : 'ecosystem')
        setWarpDirection(null)
        warpTimeoutRef.current = undefined
      }, duration)
    },
    [prefersReducedMotion],
  )

  const beginWarpToDestination = useCallback(
    (program: ProgramRollup) => {
      if (warpDirection !== null) {
        return
      }

      setDestinationProgram(program)
      setWarpDirection('to-destination')
      finishWarpAfter('to-destination')
    },
    [finishWarpAfter, warpDirection],
  )

  const selectProgram = useCallback(
    (programId: string) => {
      const normalizedProgramId = programId.trim()

      if (!normalizedProgramId || warpDirection !== null) {
        return
      }

      const planetIndex = planets.findIndex(
        (planet) => planet.program?.programId === normalizedProgramId,
      )
      const knownProgram = programRollup.programs.find(
        (program) => program.programId === normalizedProgramId,
      )
      const knownMetadata = getKnownProgramMetadata(normalizedProgramId)
      const targetProgram: ProgramRollup =
        knownProgram
          ? {
              ...knownProgram,
              category: knownMetadata?.category ?? knownProgram.category,
              name: knownProgram.name ?? knownMetadata?.name ?? null,
            }
          : ({
              appearedInSlots: [],
              blockCount: 0,
              category: knownMetadata?.category ?? 'other',
              name: knownMetadata?.name ?? null,
              programId: normalizedProgramId,
              totalTxns: 0,
            } satisfies ProgramRollup)

      setSelectedProgramId(planetIndex === -1 ? null : planetIndex)
      setSelectedDestinationBlockId(null)
      setSearchValue(knownProgram?.name ?? knownMetadata?.name ?? normalizedProgramId)
      if (searchInputRef.current) {
        searchInputRef.current.value =
          knownProgram?.name ?? knownMetadata?.name ?? normalizedProgramId
      }
      setActiveProgramId(normalizedProgramId)
      setActivityResult(null)
      beginWarpToDestination(targetProgram)
    },
    [beginWarpToDestination, planets, programRollup.programs, warpDirection],
  )

  const returnHome = useCallback(() => {
    if (warpDirection !== null) {
      return
    }

    setSelectedProgramId(null)
    setSelectedDestinationBlockId(null)
    setWarpDirection('to-ecosystem')
    finishWarpAfter('to-ecosystem')
  }, [finishWarpAfter, warpDirection])

  useEffect(() => {
    return () => {
      if (warpTimeoutRef.current) {
        window.clearTimeout(warpTimeoutRef.current)
      }
    }
  }, [])

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const submittedValue = searchInputRef.current?.value ?? searchValue
    const normalizedSearchValue = submittedValue.trim().toLowerCase()
    const matchingProgram = popularPrograms.find(
      (program) =>
        program.name?.toLowerCase() === normalizedSearchValue ||
        program.programId.toLowerCase() === normalizedSearchValue,
    )

    selectProgram(matchingProgram?.programId ?? submittedValue)
  }

  useEffect(() => {
    if (!activeProgramId) {
      return
    }

    let cancelled = false

    fetchProgramActivity(activeProgramId).then((result) => {
      if (!cancelled) {
        setActivityResult(result)
      }
    })

    return () => {
      cancelled = true
    }
  }, [activeProgramId])

  return (
    <main className="galaxy-shell" ref={shellRef}>
      <div
        className={`galaxy-title ${activeScene === 'destination' ? 'is-hidden' : ''}`}
        aria-hidden="true"
        ref={titleRef}
      >
        <h1>Blockchain Galaxy</h1>
        <p>Major Solana programs orbiting the mainnet sun.</p>
      </div>
      {activeScene === 'ecosystem' && (
        <>
          <ProgramSearchPanel
            activityResult={activityResult}
            activityStatus={activityStatus}
            inputRef={searchInputRef}
            onSubmit={handleSearchSubmit}
            popularPrograms={popularPrograms}
            searchValue={searchValue}
            setSearchValue={setSearchValue}
          />
          {showLegend && <CategoryLegend onDismiss={() => setShowLegend(false)} />}
          <ProgramInfoPanel
            recentBlockCount={programRollup.blockCount}
            selectedProgram={selectedProgram}
          />
        </>
      )}
      {activeScene === 'destination' && (
        <>
          <DestinationHud
            activityResult={activityResult}
            activityStatus={activityStatus}
            onReturnHome={returnHome}
            program={destinationProgram}
          />
          <BlockInfoPanel
            inspectedProgram={destinationProgram}
            selectedBlock={selectedDestinationBlock}
            source={destinationSource}
          />
        </>
      )}
      <WarpOverlay
        direction={warpDirection}
        prefersReducedMotion={prefersReducedMotion}
        program={destinationProgram}
      />
      <Canvas
        camera={{ position: [0, 12.2, 17.6], fov: 48, rotation: [-0.606, 0, 0] }}
        className={`galaxy-canvas ${
          isHoveringProgram ? 'is-hovering-block' : ''
        }`}
        dpr={0.85}
        gl={{ antialias: true, toneMapping: ACESFilmicToneMapping }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
        onPointerMissed={() => setDeselectSignal((signal) => signal + 1)}
      >
        {activeScene === 'destination' ? (
          <BlockchainScene
            planets={destinationPlanets}
            deselectSignal={deselectSignal}
            emptyMessage={
              activityStatus === 'loading'
                ? 'Loading recent program activity...'
                : 'No recent activity found'
            }
            initialFocusBlockId={null}
            onHoverBlock={setIsHoveringProgram}
            prefersReducedMotion={prefersReducedMotion || isWarping}
            selectedBlockId={selectedDestinationBlockId}
            setSelectedBlockId={setSelectedDestinationBlockId}
            sunColor={
              destinationProgram
                ? categoryColors[destinationProgram.category]
                : '#28ffe7'
            }
            sunLabel={
              destinationProgram
                ? (destinationProgram.name ??
                  shortProgramId(destinationProgram.programId))
                : 'Program System'
            }
            sunRadius={destinationSunRadius}
            sunSubLabel={getDestinationSunSubLabel(
              destinationProgram,
              activityResult,
              activityStatus,
            )}
          />
        ) : (
          <BlockchainScene
            planets={planets}
            deselectSignal={deselectSignal}
            initialFocusBlockId={initialFocusProgramId}
            onHoverBlock={setIsHoveringProgram}
            prefersReducedMotion={prefersReducedMotion || isWarping}
            selectedBlockId={selectedProgramId}
            setSelectedBlockId={setSelectedProgramId}
          />
        )}
      </Canvas>
    </main>
  )
}

function ProgramSearchPanel({
  activityResult,
  activityStatus,
  inputRef,
  onSubmit,
  popularPrograms,
  searchValue,
  setSearchValue,
}: {
  activityResult: ProgramActivityResult | null
  activityStatus: 'idle' | 'loading' | 'ready'
  inputRef: RefObject<HTMLInputElement | null>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  popularPrograms: ProgramRollup[]
  searchValue: string
  setSearchValue: (value: string) => void
}) {
  const visibleBlocks = activityResult?.blocks.slice(0, 8) ?? []
  const resultName =
    activityResult?.name ?? shortProgramId(activityResult?.programId ?? '')

  return (
    <section className="program-search-panel" aria-label="Program search">
      <form onSubmit={onSubmit}>
        <input
          aria-label="Search Solana program"
          defaultValue={searchValue}
          list="program-search-options"
          onChange={(event) => setSearchValue(event.target.value)}
          onInput={(event) => setSearchValue(event.currentTarget.value)}
          placeholder={defaultSearchPlaceholder}
          ref={inputRef}
        />
        <button type="submit">Inspect</button>
      </form>
      <datalist id="program-search-options">
        {popularPrograms.map((program) => (
          <option key={program.programId} value={program.name ?? program.programId}>
            {`${categoryLabels[program.category]} · ${program.totalTxns.toLocaleString()} txns · ${shortProgramId(program.programId)}`}
          </option>
        ))}
      </datalist>
      {activityStatus === 'loading' && (
        <div className="program-search-result is-muted">Checking recent activity...</div>
      )}
      {activityStatus === 'ready' && activityResult && (
        <div className="program-search-result">
          <div className="program-search-result__summary">
            <strong>{resultName}</strong>
            <span>
              found in {activityResult.blocks.length} of last{' '}
              {activityResult.blockWindow} blocks ·{' '}
              {activityResult.totalTxns.toLocaleString()} txns
            </span>
            <span
              className={`program-search-result__source is-${activityResult.source}`}
            >
              <i />
              {activityResult.source === 'live' ? 'LIVE' : 'CACHED'}
            </span>
          </div>
          {activityResult.note && (
            <p className="program-search-result__note">{activityResult.note}</p>
          )}
          <div className="program-search-result__blocks">
            {visibleBlocks.length > 0 ? (
              visibleBlocks.map((block) => (
                <div key={block.slot}>
                  <span>Slot {block.slot}</span>
                  <span>{block.txCount} txns</span>
                  <span>{block.timestamp}</span>
                </div>
              ))
            ) : (
              <div>
                <span>No recent cached block hits</span>
                <span>0 txns</span>
                <span>--:--:--</span>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function DestinationHud({
  activityResult,
  activityStatus,
  onReturnHome,
  program,
}: {
  activityResult: ProgramActivityResult | null
  activityStatus: 'idle' | 'loading' | 'ready'
  onReturnHome: () => void
  program: ProgramRollup | null
}) {
  const programName = program?.name ?? shortProgramId(program?.programId ?? '')
  const category = program ? categoryLabels[program.category] : 'Program'
  const sourceLabel =
    activityResult?.source === 'live'
      ? 'LIVE'
      : activityResult?.source === 'cached'
        ? 'CACHED'
        : 'LOADING'

  return (
    <section className="destination-hud" aria-label="Destination system">
      <button onClick={onReturnHome} type="button">
        Back to Solana
      </button>
      <div>
        <span>Destination</span>
        <strong>{programName || 'Program System'}</strong>
        <p>
          {category} system · {sourceLabel} ·{' '}
          {activityStatus === 'ready'
            ? `${activityResult?.blocks.length ?? 0} block planets`
            : 'system loading...'}
        </p>
      </div>
    </section>
  )
}

function getDestinationSunSubLabel(
  program: ProgramRollup | null,
  activityResult: ProgramActivityResult | null,
  activityStatus: 'idle' | 'loading' | 'ready',
) {
  if (!program) {
    return activityStatus === 'loading' ? 'Loading program activity' : undefined
  }

  const sourceLabel =
    activityResult?.source === 'live'
      ? 'LIVE'
      : activityResult?.source === 'cached'
        ? 'CACHED'
        : 'LOADING'
  const totalTxns = activityResult?.totalTxns ?? program.totalTxns

  return `${categoryLabels[program.category]} · ${totalTxns.toLocaleString()} txns · ${sourceLabel}`
}

function WarpOverlay({
  direction,
  prefersReducedMotion,
  program,
}: {
  direction: WarpDirection | null
  prefersReducedMotion: boolean
  program: ProgramRollup | null
}) {
  const programName = program?.name ?? shortProgramId(program?.programId ?? '')
  const label =
    direction === 'to-ecosystem'
      ? 'Returning to Solana Mainnet'
      : `Warping to ${programName || 'program system'}`

  return (
    <div
      aria-hidden={direction === null}
      className={[
        'warp-overlay',
        direction ? 'is-active' : '',
        direction === 'to-ecosystem' ? 'is-returning' : '',
        prefersReducedMotion ? 'is-reduced-motion' : '',
      ].join(' ')}
    >
      <div className="warp-overlay__tunnel">
        {Array.from({ length: 28 }, (_, index) => (
          <span key={index} style={{ '--i': index } as CSSProperties} />
        ))}
      </div>
      <div className="warp-overlay__flash" />
      <div className="warp-overlay__label">{label}</div>
    </div>
  )
}

function shortProgramId(programId: string) {
  if (programId.length <= 12) {
    return programId || 'Program'
  }

  return `${programId.slice(0, 4)}...${programId.slice(-4)}`
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function CategoryLegend({ onDismiss }: { onDismiss: () => void }) {
  return (
    <aside className="category-legend" aria-label="Program category legend">
      <div className="category-legend__topline">
        <span>World Type</span>
        <button aria-label="Hide category legend" onClick={onDismiss} type="button">
          ×
        </button>
      </div>
      <ul>
        {activityCategories.map((category) => (
          <li key={category}>
            <span
              className="category-legend__swatch"
              style={{ '--category-color': categoryColors[category] } as CSSProperties}
            />
            {worldTypeLabels[category]}
          </li>
        ))}
      </ul>
    </aside>
  )
}

function BlockInfoPanel({
  inspectedProgram,
  selectedBlock,
  source,
}: {
  inspectedProgram?: ProgramRollup | null
  selectedBlock: ScenePlanet | null
  source: DataSource
}) {
  const block = selectedBlock?.block

  return (
    <aside
      className={`block-info-panel ${block ? 'is-visible' : ''}`}
      style={
        { '--block-glow': selectedBlock?.color ?? '#28ffe7' } as CSSProperties
      }
    >
      <div className="block-info-panel__topline">
        <div className="block-info-panel__label">Selected Block</div>
        <div className={`block-info-panel__source is-${source}`}>
          <span />
          {source === 'live' ? 'LIVE' : 'CACHED'}
        </div>
      </div>
      <dl>
        <div>
          <dt>Slot</dt>
          <dd>{block?.slot ?? '---'}</dd>
        </div>
        <div>
          <dt>Transactions</dt>
          <dd>{block?.transactions ?? '---'}</dd>
        </div>
        <div>
          <dt>Timestamp</dt>
          <dd>{block?.timestamp ?? '--:--:--'}</dd>
        </div>
      </dl>
      {block && (
        <div className="block-info-panel__activity">
          <div className="block-info-panel__activity-title">Activity Mix</div>
          <div className="activity-mix-bar" aria-label="Activity mix">
            {activityCategories.map((category) => (
              <span
                key={category}
                style={
                  {
                    '--category-color': categoryColors[category],
                    width: `${block.categoryMix[category] * 100}%`,
                  } as CSSProperties
                }
                title={`${categoryLabels[category]} ${formatPercent(
                  block.categoryMix[category],
                )}`}
              />
            ))}
          </div>
          <div className="activity-mix-labels">
            {activityCategories.map((category) => (
              <span key={category}>
                {categoryLabels[category]}{' '}
                {formatPercent(block.categoryMix[category])}
              </span>
            ))}
          </div>
          <div className="activity-mix-footnote">
            Vote {block.programCounts.vote} · Infra {block.programCounts.infra} ·
            Failed {formatPercent(block.failedTxRatio)}
          </div>
          {inspectedProgram && (
            <div className="block-info-panel__programs">
              <div className="block-info-panel__activity-title">Program</div>
              <a
                href={`https://solscan.io/account/${inspectedProgram.programId}`}
                rel="noreferrer"
                target="_blank"
              >
                <span>{inspectedProgram.name ?? 'Selected Program'}</span>
                <small>{shortProgramId(inspectedProgram.programId)}</small>
              </a>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}

function ProgramInfoPanel({
  recentBlockCount,
  selectedProgram,
}: {
  recentBlockCount: number
  selectedProgram: ScenePlanet | null
}) {
  const program = selectedProgram?.program

  return (
    <aside
      className={`block-info-panel program-info-panel ${
        program ? 'is-visible' : ''
      }`}
      style={
        { '--block-glow': selectedProgram?.color ?? '#28ffe7' } as CSSProperties
      }
    >
      <div className="block-info-panel__topline">
        <div className="block-info-panel__label">Selected Program</div>
        <div className="block-info-panel__source is-cached">
          <span />
          SNAPSHOT
        </div>
      </div>
      <dl>
        <div>
          <dt>Program</dt>
          <dd>{program?.name ?? '---'}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{program ? categoryLabels[program.category] : '---'}</dd>
        </div>
        <div>
          <dt>Total Txns</dt>
          <dd>{program?.totalTxns.toLocaleString() ?? '---'}</dd>
        </div>
        <div>
          <dt>Appeared</dt>
          <dd>
            {program
              ? `${program.blockCount} of ${recentBlockCount}`
              : `0 of ${recentBlockCount}`}
          </dd>
        </div>
      </dl>
      {program && (
        <div className="program-info-panel__program-id">
          <span>Program ID</span>
          <a
            href={`https://solscan.io/account/${program.programId}`}
            rel="noreferrer"
            target="_blank"
          >
            {program.programId}
          </a>
        </div>
      )}
    </aside>
  )
}
