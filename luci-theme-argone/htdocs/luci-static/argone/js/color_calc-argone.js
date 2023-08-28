/*
 *  The background color of the [Light Mode] subtabs follow the custom primary color and reduce its transparency
 *  Author: SpeedPartner
 */

/*
 *  Get hex for the [Light mode] Primary Color ,then reduce it to 25% transparency and convert it to RGBA value
 */
	const hexColor_primary_light = getComputedStyle(document.documentElement).getPropertyValue('--primary').replace(/\s/, "");
	const hexToRgba_primary_light = (hex) => {
  		const r = parseInt(hex.substring(1, 3), 16);
  		const g = parseInt(hex.substring(3, 5), 16);
  		const b = parseInt(hex.substring(5, 7), 16);
  		const a = 0.15
  		return [r, g, b].map(x => x.toFixed()).concat(a);
	};
	const rgbaColor_primary_light = hexToRgba_primary_light(hexColor_primary_light);
	console.log(rgbaColor_primary_light);

/*
 *  Constitute a css color variable named light-subtabs-background
 */
	document.documentElement.style.setProperty('--light-subtabs-background', `rgba(`+rgbaColor_primary_light+`)`);


/*
 *  Improved link font color that follows custom [Dark mode] Primary Color
 *  Author: SpeedPartner
 */

/*
 *  Get hex for the [Dark mode] Primary Color ,then reduce it to 70% transparency and convert it to RGB value
 */
	const hexColor_primary = getComputedStyle(document.documentElement).getPropertyValue('--dark-primary').replace(/\s/, "");
	const hexToRgb_primary = (hex) => {
  		const r = parseInt(hex.substring(1, 3), 16);
  		const g = parseInt(hex.substring(3, 5), 16);
  		const b = parseInt(hex.substring(5, 7), 16);
  		const a = 0.7
  		return [r*a, g*a, b*a].map(x => x.toFixed(2));
	};
	const rgbColor_primary = hexToRgb_primary(hexColor_primary);
	//console.log(rgbColor_primary);

/*
 *  Constitute overlay color #cccccc, then reduce it to 30% transparency and convert it to RGB value
 */
	const hexColor_overlay = "#cccccc";
	const hexToRgb_overlay = (hex) => {
  		const r = parseInt(hex.substring(1, 3), 16);
  		const g = parseInt(hex.substring(3, 5), 16);
  		const b = parseInt(hex.substring(5, 7), 16);
  		const a = 0.3
  		return [r*a, g*a, b*a].map(x => x.toFixed(2));
	};
	const rgbColor_overlay = hexToRgb_overlay(hexColor_overlay);
	//console.log(rgbColor_overlay);

/*
 *  Overlay the RGB value of two colors
 */
	const New_Color = [
  		Math.round(Number(rgbColor_primary[0]) + Number(rgbColor_overlay[0])),
  		Math.round(Number(rgbColor_primary[1]) + Number(rgbColor_overlay[1])),
  		Math.round(Number(rgbColor_primary[2]) + Number(rgbColor_overlay[2]))
	];
	//console.log(New_Color);

/*
 *  Constitute a css color variable named dark_webkit-any-link
 */
	document.documentElement.style.setProperty('--dark_webkit-any-link', `rgb(`+New_Color+`)`);
