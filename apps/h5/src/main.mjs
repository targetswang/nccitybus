import { h, React, createRoot } from './runtime.mjs';
import App from './App.mjs';
class Boundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            error: false
        };
    }
    static getDerivedStateFromError() {
        return {
            error: true
        };
    }
    render() {
        return this.state.error ? h('div', {
            className: 'state-card'
        }, h('h1', null, '页面暂时无法显示'), h('p', null, '请重新加载。'), h('button', {
            onClick: () => location.reload()
        }, '重新加载')) : this.props.children;
    }
}
createRoot(document.getElementById('root')).render(h(Boundary, null, h(App)));

