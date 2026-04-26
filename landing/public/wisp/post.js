// Post stack trimmed for ione: no bloom, no radial chromatic smear on the
// color pass (that pass was the “nuclear glow” even when bloom was reduced).
import {
  ClampToEdgeWrapping,
  GLSL3,
  LinearFilter,
  RGBAFormat,
  RawShaderMaterial,
  UnsignedByteType,
} from "./third_party/three.module.js";

import { ShaderPass } from "./modules/ShaderPass.js";
import { getFBO } from "./modules/fbo.js";
import { shader as levels } from "./shaders/levels.js";
import { shader as noise } from "./shaders/noise.js";
import { shader as orthoVertexShader } from "./shaders/ortho.js";
import { shader as vignette } from "./shaders/vignette.js";

const finalFragmentShader = `
precision highp float;

uniform sampler2D inputTexture;
uniform float vignetteBoost;
uniform float vignetteReduction;
uniform float time;

in vec2 vUv;
out vec4 fragColor;

${vignette}
${noise}
${levels}

void main() {
  vec4 color = texture(inputTexture, vUv);
  // Gentle Reinhard on a black stage — keep mids readable without milky haze.
  vec3 c = color.rgb / (color.rgb + vec3(0.48));
  fragColor = vec4(c, color.a);
  fragColor *= vignette(vUv, vignetteBoost, vignetteReduction);
  fragColor += 0.0015 * noise(gl_FragCoord.xy, time);
  fragColor.rgb = finalLevels(fragColor.rgb, vec3(0.06), vec3(1.0), vec3(0.62));
  float lum = dot(fragColor.rgb, vec3(0.299, 0.587, 0.114));
  fragColor.a = smoothstep(0.006, 0.38, lum);
}
`;

class Post {
  constructor(renderer, params = {}) {
    this.renderer = renderer;
    this.colorFBO = getFBO(1, 1, { samples: 0 });

    this.finalShader = new RawShaderMaterial({
      uniforms: {
        vignetteBoost: { value: params.vignetteBoost ?? 1.0 },
        vignetteReduction: { value: params.vignetteReduction ?? 1.32 },
        inputTexture: { value: this.colorFBO.texture },
        time: { value: 0 },
      },
      vertexShader: orthoVertexShader,
      fragmentShader: finalFragmentShader,
      glslVersion: GLSL3,
    });

    this.finalPass = new ShaderPass(this.finalShader, {
      format: RGBAFormat,
      type: UnsignedByteType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
    });
  }

  setSize(w, h) {
    this.colorFBO.setSize(w, h);
    this.finalPass.setSize(w, h);
  }

  render(scene, camera) {
    const t = Math.random() * 100000;
    this.renderer.setRenderTarget(this.colorFBO);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);

    this.finalShader.uniforms.inputTexture.value = this.colorFBO.texture;
    this.finalShader.uniforms.time.value = t;
    this.finalPass.render(this.renderer, true);
  }
}

export { Post };
