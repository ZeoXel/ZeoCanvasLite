'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import type { CameraParams } from '@/types';
import { getProxiedUrl } from './shared';

// 主题颜色配置
const THEME_COLORS = {
  dark: {
    background: 0x0f172a,
    gridMain: 0xffffff,  // 白色网格线
    gridSub: 0x94a3b8,   // 次要线浅灰
    plane: 0x334155,
  },
  light: {
    background: 0xf1f5f9,
    gridMain: 0x1e293b,  // 深色网格线
    gridSub: 0x64748b,
    plane: 0xcbd5e1,
  }
};

interface Camera3DVisualizerProps {
  params: CameraParams;
  imageUrl: string | null;
  onParamsChange: (newParams: Partial<CameraParams>) => void;
}

const Camera3DVisualizer: React.FC<Camera3DVisualizerProps> = ({
  params,
  imageUrl,
  onParamsChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const cameraModelRef = useRef<THREE.Group | null>(null);
  const imagePlaneRef = useRef<THREE.Mesh | null>(null);
  const elevationArcRef = useRef<THREE.Line | null>(null);
  const interactiveAxesRef = useRef<THREE.Group | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const [dragMode, setDragMode] = useState<'none' | 'rotate' | 'distance'>('none');
  const [hoveredAxis, setHoveredAxis] = useState<string | null>(null);
  const [imageLoadStatus, setImageLoadStatus] = useState<'none' | 'loading' | 'loaded' | 'error'>('none');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // SSR 安全的初始值
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });
  const gridRef = useRef<THREE.GridHelper | null>(null);

  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragStartParams = useRef({ azimuth: 0, elevation: 0, distance: 1.0 });
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const animationFrameId = useRef<number>(0);

  // 检测深色模式
  useEffect(() => {
    const checkDarkMode = () => setIsDarkMode(document.documentElement.classList.contains('dark'));
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // 主题变化时更新场景颜色
  useEffect(() => {
    if (!isInitialized || !sceneRef.current) return;
    const colors = isDarkMode ? THEME_COLORS.dark : THEME_COLORS.light;
    sceneRef.current.background = new THREE.Color(colors.background);
    // 更新网格颜色 (GridHelper 的 material 可能是单个或数组)
    if (gridRef.current) {
      const materials = gridRef.current.material;
      if (Array.isArray(materials)) {
        materials.forEach(mat => {
          if (mat instanceof THREE.LineBasicMaterial) {
            mat.color.setHex(colors.gridMain);
          }
        });
      } else if (materials instanceof THREE.LineBasicMaterial) {
        materials.color.setHex(colors.gridMain);
      }
    }
    // 更新图片平面颜色（当没有图片时）
    if (imagePlaneRef.current && imageLoadStatus !== 'loaded') {
      (imagePlaneRef.current.material as THREE.MeshBasicMaterial).color.setHex(colors.plane);
    }
  }, [isDarkMode, imageLoadStatus, isInitialized]);

  // 初始化 Scene
  useEffect(() => {
    if (!containerRef.current) return;

    // 清理可能存在的旧 Canvas
    const existingCanvas = containerRef.current.querySelector('canvas');
    if (existingCanvas) containerRef.current.removeChild(existingCanvas);

    const initialDark = document.documentElement.classList.contains('dark');
    const colors = initialDark ? THEME_COLORS.dark : THEME_COLORS.light;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(colors.background);
    sceneRef.current = scene;

    const width = containerRef.current.clientWidth || 300;
    const height = containerRef.current.clientHeight || 200;
    const aspect = width / height;

    const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    camera.position.set(8, 6, 8);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 光照
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 15, 10);
    scene.add(directionalLight);

    // 辅助网格
    const grid = new THREE.GridHelper(10, 20, colors.gridMain, colors.gridSub);
    scene.add(grid);
    gridRef.current = grid;

    // 图片平面 - 放置在场景中心
    const planeGeom = new THREE.PlaneGeometry(2.5, 2.5);
    const planeMat = new THREE.MeshBasicMaterial({
      color: colors.plane,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    const imagePlane = new THREE.Mesh(planeGeom, planeMat);
    scene.add(imagePlane);
    imagePlaneRef.current = imagePlane;

    // 摄像机模型
    const cameraGroup = new THREE.Group();
    const bodyGeom = new THREE.BoxGeometry(0.6, 0.4, 0.5);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x3b82f6 });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    cameraGroup.add(body);

    const lensGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.4, 32);
    const lensMat = new THREE.MeshPhongMaterial({ color: 0xfacc15, shininess: 100 });
    const lens = new THREE.Mesh(lensGeom, lensMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 0.4;
    cameraGroup.add(lens);

    // 交互轴
    const axesGroup = new THREE.Group();
    axesGroup.position.z = 0.6;

    const createAxis = (color: number, rotation: THREE.Euler, name: string) => {
      const group = new THREE.Group();
      group.name = name;
      const lineGeom = new THREE.CylinderGeometry(0.02, 0.02, 1.2, 8);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
      const line = new THREE.Mesh(lineGeom, mat);
      line.position.y = 0.6;
      line.name = `${name}-visible`;
      group.add(line);
      const hitboxGeom = new THREE.CylinderGeometry(0.4, 0.4, 1.5, 8);
      const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitbox = new THREE.Mesh(hitboxGeom, hitboxMat);
      hitbox.position.y = 0.75;
      hitbox.name = `${name}-hitbox`;
      group.add(hitbox);
      group.setRotationFromEuler(rotation);
      return group;
    };

    axesGroup.add(createAxis(0xff3b30, new THREE.Euler(0, 0, -Math.PI / 2), 'axis-x'));
    axesGroup.add(createAxis(0x34c759, new THREE.Euler(0, 0, 0), 'axis-y'));
    axesGroup.add(createAxis(0x007aff, new THREE.Euler(Math.PI / 2, 0, 0), 'axis-z'));
    cameraGroup.add(axesGroup);
    interactiveAxesRef.current = axesGroup;

    scene.add(cameraGroup);
    cameraModelRef.current = cameraGroup;

    const animate = () => {
      animationFrameId.current = requestAnimationFrame(animate);
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();
    setIsInitialized(true);

    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      setIsInitialized(false);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId.current);
      renderer.dispose();
      if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // 加载图片纹理
  useEffect(() => {
    if (!imageUrl) {
      setImageLoadStatus('none');
      return;
    }

    if (!isInitialized || !imagePlaneRef.current) {
      return;
    }

    // 使用代理 URL 处理跨域问题
    const proxiedUrl = getProxiedUrl(imageUrl);
    setImageLoadStatus('loading');

    // 使用 Image 对象加载图片，支持 base64 和普通 URL
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!imagePlaneRef.current) return;
      const texture = new THREE.Texture(img);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;

      // 根据图片比例调整平面尺寸
      const aspectRatio = img.width / img.height;
      const baseSize = 2.5;
      if (aspectRatio > 1) {
        imagePlaneRef.current.scale.set(baseSize, baseSize / aspectRatio, 1);
      } else {
        imagePlaneRef.current.scale.set(baseSize * aspectRatio, baseSize, 1);
      }

      const mat = imagePlaneRef.current.material as THREE.MeshBasicMaterial;
      mat.map = texture;
      mat.color.set(0xffffff);
      mat.opacity = 1;
      mat.transparent = false;
      mat.needsUpdate = true;
      setImageLoadStatus('loaded');
    };
    img.onerror = () => {
      setImageLoadStatus('error');
    };
    img.src = proxiedUrl;
  }, [imageUrl, isInitialized]);

  // 同步参数到模型
  useEffect(() => {
    if (!isInitialized || !cameraModelRef.current) return;

    const azimuthRad = (params.azimuth * Math.PI) / 180;
    const elevationRad = (params.elevation * Math.PI) / 180;
    const radius = 4 * params.distance;

    const x = radius * Math.cos(elevationRad) * Math.sin(azimuthRad);
    const y = radius * Math.sin(elevationRad);
    const z = radius * Math.cos(elevationRad) * Math.cos(azimuthRad);

    cameraModelRef.current.position.set(x, y, z);
    cameraModelRef.current.lookAt(0, 0, 0);

    // 更新俯仰辅助弧线
    if (sceneRef.current) {
      if (elevationArcRef.current) sceneRef.current.remove(elevationArcRef.current);
      const arcPoints = [];
      for(let i=0; i<=20; i++) {
          const t = (i/20) * elevationRad;
          arcPoints.push(new THREE.Vector3(
            radius * Math.cos(t) * Math.sin(azimuthRad),
            radius * Math.sin(t),
            radius * Math.cos(t) * Math.cos(azimuthRad)
          ));
      }
      const arcGeom = new THREE.BufferGeometry().setFromPoints(arcPoints);
      const arcMat = new THREE.LineBasicMaterial({ color: 0xec4899, transparent: true, opacity: 0.4 });
      const arc = new THREE.Line(arcGeom, arcMat);
      sceneRef.current.add(arc);
      elevationArcRef.current = arc;
    }
  }, [params, isInitialized]);

  const updateMouse = useCallback((e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) => {
    if (!containerRef.current) return;
    let cx, cy;
    if ('touches' in e && e.touches.length > 0) {
      cx = e.touches[0].clientX;
      cy = e.touches[0].clientY;
    } else {
      cx = (e as MouseEvent).clientX;
      cy = (e as MouseEvent).clientY;
    }
    const rect = containerRef.current.getBoundingClientRect();
    mouse.current.x = ((cx - rect.left) / rect.width) * 2 - 1;
    mouse.current.y = -((cy - rect.top) / rect.height) * 2 + 1;
  }, []);

  const getIntersectedAxis = useCallback(() => {
    if (!cameraRef.current || !interactiveAxesRef.current) return null;
    raycaster.current.setFromCamera(mouse.current, cameraRef.current);
    const intersects = raycaster.current.intersectObjects(interactiveAxesRef.current.children, true);
    if (intersects.length > 0) {
      let obj: THREE.Object3D | null = intersects[0].object;
      while (obj && !obj.name.startsWith('axis-')) obj = obj.parent;
      return obj?.name || null;
    }
    return null;
  }, []);

  // 检查是否点击到摄像头模型
  const isCameraModelHit = useCallback(() => {
    if (!cameraRef.current || !cameraModelRef.current) return false;
    raycaster.current.setFromCamera(mouse.current, cameraRef.current);
    const intersects = raycaster.current.intersectObjects(cameraModelRef.current.children, true);
    return intersects.length > 0;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    updateMouse(e);

    // 仅当点击摄像头模型时才触发拖拽
    const cameraHit = isCameraModelHit();
    if (!cameraHit) {
      // 没有点击摄像头，不阻止事件，允许节点拖拽
      return;
    }

    // 阻止事件冒泡，避免与节点拖拽冲突
    e.stopPropagation();
    e.preventDefault();

    const hit = getIntersectedAxis();
    const cx = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const cy = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    if (hit === 'axis-z') setDragMode('distance');
    else setDragMode('rotate');

    dragStartPos.current = { x: cx, y: cy };
    dragStartParams.current = { ...params };
  }, [updateMouse, getIntersectedAxis, isCameraModelHit, params]);

  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    updateMouse(e);
    if (dragMode === 'none') {
      const hit = getIntersectedAxis();
      if (hit !== hoveredAxis) setHoveredAxis(hit);
      return;
    }

    const cx = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const cy = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    const dx = cx - dragStartPos.current.x;
    const dy = cy - dragStartPos.current.y;

    if (dragMode === 'rotate') {
      let newAz = (dragStartParams.current.azimuth + dx * 0.5) % 360;
      if (newAz < 0) newAz += 360;
      const newEl = Math.max(-30, Math.min(60, dragStartParams.current.elevation - dy * 0.3));
      onParamsChange({ azimuth: Math.round(newAz), elevation: Math.round(newEl) });
    } else if (dragMode === 'distance') {
      const newDist = Math.max(0.6, Math.min(1.5, dragStartParams.current.distance + dy * 0.005));
      onParamsChange({ distance: parseFloat(newDist.toFixed(2)) });
    }
  }, [dragMode, hoveredAxis, onParamsChange, updateMouse, getIntersectedAxis]);

  useEffect(() => {
    const handleUp = () => setDragMode('none');
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMouseMove, { passive: false });
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [handleMouseMove]);

  return (
    <div className="relative w-full h-full group select-none">
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        className={`w-full h-full rounded-lg overflow-hidden transition-colors ${
          dragMode !== 'none' ? 'cursor-grabbing' : ''
        }`}
      />

      {/* 操作提示 */}
      <div className="absolute top-2 right-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700/50 pointer-events-none opacity-0 group-hover:opacity-100 transition-all flex flex-col gap-1 text-[10px]">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-0.5 rounded-full ${hoveredAxis === 'axis-z' || dragMode === 'distance' ? 'bg-blue-600 dark:bg-white shadow-[0_0_6px_rgba(37,99,235,0.5)] dark:shadow-[0_0_6px_white]' : 'bg-blue-500'}`} />
          <span className={hoveredAxis === 'axis-z' || dragMode === 'distance' ? 'text-blue-600 dark:text-white font-medium' : 'text-slate-500 dark:text-slate-400'}>蓝轴：推拉焦距</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-sm bg-blue-500" />
          <span className="text-slate-500 dark:text-slate-400">拖拽摄像头旋转</span>
        </div>
      </div>

      {/* 状态提示 */}
      {imageLoadStatus === 'none' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-slate-500 text-xs text-center">
            <div className="mb-1">请连接图片输入</div>
            <div className="text-slate-600">或上传参考图</div>
          </div>
        </div>
      )}
      {imageLoadStatus === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-purple-400 text-xs">加载中...</div>
        </div>
      )}
      {imageLoadStatus === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-red-400 text-xs text-center">
            <div className="mb-1">图片加载失败</div>
            <div className="text-red-500/60 text-[10px]">请检查图片格式</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(Camera3DVisualizer);
